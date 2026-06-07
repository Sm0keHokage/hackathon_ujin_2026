import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any
from app.config import Settings
from app.crypto import Crypto
from app.dashboard_builder import build_dashboard_config
from app.db.cleanup import cleanup_old_data
from app.db.repos import buildings as buildings_repo
from app.db.repos import emergency_log as emergency_log_repo
from app.db.repos import news as news_repo
from app.db.repos import parking as parking_repo
from app.db.repos import storage as storage_repo
from app.db.repos import sync_log as sync_log_repo
from app.db.repos import weather as weather_repo
from app.db.repos import static_content as static_content_repo
from app.db.session import SessionFactory
from app.weather_client import WeatherClient
from app.demo_data import (
    extract_from_statistics,
    parking_for_buildings,
    storage_for_buildings,
)
from app.models import ResourceSummary
from app.services import EmergencyStore, build_overview_from_cache
from app.ujin_client import UjinClient, UjinNotFoundError
from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)


async def _broadcast_overview(ws_manager: ConnectionManager, cache: dict[str, Any]) -> None:
    overview = build_overview_from_cache(cache)
    if overview is not None:
        await ws_manager.broadcast_all(
            {"type": "overview", "data": overview.model_dump(mode="json")},
        )


async def _push_dashboard_to(
    Session: SessionFactory,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
    tablo_id: str,
) -> None:
    try:
        cfg = await build_dashboard_config(Session, cache, tablo_id)
        await ws_manager.send_to(
            tablo_id,
            {"type": "dashboard", "data": cfg.model_dump(mode="json", by_alias=True)},
        )
    except Exception as exc:
        logger.warning("dashboard push failed for %s: %s", tablo_id, exc)


async def _broadcast_dashboard(
    Session: SessionFactory,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
) -> None:
    ids = ws_manager.connected_ids
    if not ids:
        return
    await asyncio.gather(*[_push_dashboard_to(Session, ws_manager, cache, tid) for tid in ids])


def _scale_summary(total: int, kind: str, building_id: int) -> ResourceSummary:
    import random
    rnd = random.Random(f"{kind}:{building_id}:stats")
    if total <= 0:
        return ResourceSummary()
    occupied = rnd.randint(int(total * 0.55), int(total * 0.85))
    return ResourceSummary(
        total=total,
        free=total - occupied,
        occupied=occupied,
        public=rnd.randint(int(total * 0.45), int(total * 0.65)),
        private=rnd.randint(int(total * 0.15), int(total * 0.35)),
        unassigned=max(0, total - rnd.randint(int(total * 0.7), total)),
    )


async def sync_fast(
    Session: SessionFactory,
    ujin_client: UjinClient,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
    settings: Settings,
) -> None:
    t0 = time.monotonic()
    token = settings.ujin_token
    source_label = "ujin_parking_storage"
    try:
        parking, storage = await asyncio.gather(
            ujin_client.parking(token),
            ujin_client.storage(token),
        )
        cache["parking"] = parking
        cache["storage"] = storage
        for building_id, summary in parking.items():
            await parking_repo.insert_snapshot(Session, building_id, summary)
        for building_id, summary in storage.items():
            await storage_repo.insert_snapshot(Session, building_id, summary)
        await _broadcast_overview(ws_manager, cache)
        await _broadcast_dashboard(Session, ws_manager, cache)
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, source_label, "ok", ms)
        logger.info("Fast sync OK (%d ms): live", ms)
        return
    except UjinNotFoundError as exc:
        logger.warning("Parking/storage upstream missing - fallback path: %s", exc)
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, source_label, "error", ms, str(exc))
        logger.error("Fast sync error: %s", exc)
        return

    buildings = cache.get("buildings") or []
    raw = cache.get("buildings_raw") or []
    parking_counts = extract_from_statistics(raw, "parking")
    storage_counts = extract_from_statistics(raw, "pantry")

    used_demo = not (parking_counts or storage_counts) and settings.demo_mode
    if parking_counts:
        parking = {bid: _scale_summary(c, "parking", bid) for bid, c in parking_counts.items()}
    elif used_demo:
        parking = parking_for_buildings(buildings)
    else:
        parking = {}

    if storage_counts:
        storage = {bid: _scale_summary(c, "storage", bid) for bid, c in storage_counts.items()}
    elif used_demo:
        storage = storage_for_buildings(buildings)
    else:
        storage = {}

    cache["parking"] = parking
    cache["storage"] = storage
    for building_id, summary in parking.items():
        await parking_repo.insert_snapshot(Session, building_id, summary)
    for building_id, summary in storage.items():
        await storage_repo.insert_snapshot(Session, building_id, summary)
    await _broadcast_overview(ws_manager, cache)
    await _broadcast_dashboard(Session, ws_manager, cache)
    ms = int((time.monotonic() - t0) * 1000)
    status = "demo" if used_demo else "stats" if (parking_counts or storage_counts) else "empty"
    await sync_log_repo.insert_log(Session, source_label, status, ms)
    logger.info("Fast sync OK (%d ms): %s (parking=%d, storage=%d)", ms, status, len(parking), len(storage))


async def sync_medium(
    Session: SessionFactory,
    ujin_client: UjinClient,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
    token: str,
) -> None:
    t0 = time.monotonic()
    try:
        news = await ujin_client.news(token)
        cache["news"] = news
        await news_repo.upsert_all(Session, news)
        await _broadcast_overview(ws_manager, cache)
        await _broadcast_dashboard(Session, ws_manager, cache)
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "ujin_news", "ok", ms)
        logger.info("Medium sync OK (%d ms)", ms)
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "ujin_news", "error", ms, str(exc))
        logger.error("Medium sync error: %s", exc)


async def sync_daily(
    Session: SessionFactory,
    ujin_client: UjinClient,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
    token: str,
    crypto: Crypto,
) -> None:
    t0 = time.monotonic()
    try:
        complexes, (buildings, raw) = await asyncio.gather(
            ujin_client.complexes(token),
            ujin_client.buildings_and_raw(token),
        )
        cache["complexes"] = complexes
        cache["buildings"] = buildings
        cache["buildings_raw"] = raw
        await buildings_repo.upsert_all(Session, buildings, complexes, crypto)
        await cleanup_old_data(Session)
        await _broadcast_overview(ws_manager, cache)
        await _broadcast_dashboard(Session, ws_manager, cache)
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "ujin_buildings", "ok", ms)
        logger.info("Daily sync OK (%d ms): %d complexes, %d buildings", ms, len(complexes), len(buildings))
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "ujin_buildings", "error", ms, str(exc))
        logger.error("Daily sync error: %s", exc)


async def sync_weather(
    Session: SessionFactory,
    weather_client: WeatherClient,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
    fallback_address: str,
) -> None:
    t0 = time.monotonic()
    try:
        address = await static_content_repo.get_value(Session, "weather_location") or fallback_address
        lat, lon = await weather_client.geocode(address)
        current, hourly, daily = await asyncio.gather(
            weather_client.fetch_current(lat, lon),
            weather_client.fetch_hourly(lat, lon),
            weather_client.fetch_daily(lat, lon),
        )
        await asyncio.gather(
            weather_repo.upsert(Session, "current", current),
            weather_repo.upsert(Session, "hourly", hourly),
            weather_repo.upsert(Session, "daily", daily),
        )
        cache["weather_current"] = current
        cache["weather_hourly"] = hourly
        cache["weather_daily"] = daily
        await ws_manager.broadcast_all({
            "type": "weather",
            "data": {"current": current, "hourly": hourly, "daily": daily},
        })
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "weather", "ok", ms)
        logger.info("Weather sync OK address=%r (%d ms)", address, ms)
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "weather", "error", ms, str(exc))
        logger.error("Weather sync error: %s", exc)


async def _loop_emergency_auto_reset(
    Session: SessionFactory,
    emergency_store: EmergencyStore,
    ws_manager: ConnectionManager,
) -> None:
    while True:
        await asyncio.sleep(30)
        state = emergency_store.get()
        if not state.active or state.auto_reset_at is None:
            continue
        if datetime.now(timezone.utc) >= state.auto_reset_at:
            if state.log_id is not None:
                await emergency_log_repo.log_deactivation(Session, state.log_id)
            new_state = emergency_store.deactivate()
            await ws_manager.broadcast_all({"type": "emergency", "data": new_state.model_dump(mode="json")})
            logger.info("Emergency auto-reset triggered")


async def run_scheduler(
    Session: SessionFactory,
    settings: Settings,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
    crypto: Crypto,
    emergency_store: EmergencyStore,
    weather_client: WeatherClient | None = None,
) -> None:
    ujin_client = UjinClient(settings)
    token = settings.ujin_token
    try:
        await sync_daily(Session, ujin_client, ws_manager, cache, token, crypto)
        await asyncio.gather(
            sync_medium(Session, ujin_client, ws_manager, cache, token),
            sync_fast(Session, ujin_client, ws_manager, cache, settings),
        )

        async def loop_fast() -> None:
            while True:
                await asyncio.sleep(settings.poll_interval_fast)
                await sync_fast(Session, ujin_client, ws_manager, cache, settings)

        async def loop_medium() -> None:
            while True:
                await asyncio.sleep(settings.poll_interval_medium)
                await sync_medium(Session, ujin_client, ws_manager, cache, token)

        async def loop_daily() -> None:
            while True:
                await asyncio.sleep(settings.poll_interval_daily)
                await sync_daily(Session, ujin_client, ws_manager, cache, token, crypto)

        coroutines = [
            loop_fast(),
            loop_medium(),
            loop_daily(),
            _loop_emergency_auto_reset(Session, emergency_store, ws_manager),
        ]

        if weather_client is not None:
            weather_kwargs = dict(
                Session=Session,
                weather_client=weather_client,
                ws_manager=ws_manager,
                cache=cache,
                fallback_address=settings.openweather_address,
            )
            await sync_weather(**weather_kwargs)

            async def loop_weather() -> None:
                while True:
                    await asyncio.sleep(settings.weather_poll_interval)
                    await sync_weather(**weather_kwargs)

            coroutines.append(loop_weather())

        await asyncio.gather(*coroutines)
    finally:
        await ujin_client.close()