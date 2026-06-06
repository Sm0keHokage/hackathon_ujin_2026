import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any
from app.config import Settings
from app.crypto import Crypto
from app.db.cleanup import cleanup_old_data
from app.db.repos import buildings as buildings_repo
from app.db.repos import emergency_log as emergency_log_repo
from app.db.repos import news as news_repo
from app.db.repos import parking as parking_repo
from app.db.repos import storage as storage_repo
from app.db.repos import sync_log as sync_log_repo
from app.db.session import SessionFactory
from app.services import EmergencyStore, build_overview_from_cache
from app.ujin_client import UjinClient
from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)


async def _broadcast_overview(ws_manager: ConnectionManager, cache: dict[str, Any]) -> None:
    overview = build_overview_from_cache(cache)
    if overview is not None:
        await ws_manager.broadcast_all({"type": "overview", "data": overview.model_dump()})


async def sync_fast(
    Session: SessionFactory,
    ujin_client: UjinClient,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
    token: str,
) -> None:
    t0 = time.monotonic()
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
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "ujin_parking_storage", "ok", ms)
        logger.info("Fast sync OK (%d ms)", ms)
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "ujin_parking_storage", "error", ms, str(exc))
        logger.error("Fast sync error: %s", exc)


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
        complexes, buildings = await asyncio.gather(
            ujin_client.complexes(token),
            ujin_client.buildings(token),
        )
        cache["complexes"] = complexes
        cache["buildings"] = buildings
        await buildings_repo.upsert_all(Session, buildings, complexes, crypto)
        await cleanup_old_data(Session)
        await _broadcast_overview(ws_manager, cache)
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "ujin_buildings", "ok", ms)
        logger.info("Daily sync OK (%d ms)", ms)
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await sync_log_repo.insert_log(Session, "ujin_buildings", "error", ms, str(exc))
        logger.error("Daily sync error: %s", exc)


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
            await ws_manager.broadcast_all({"type": "emergency", "data": new_state.model_dump()})
            logger.info("Emergency auto-reset triggered")


async def run_scheduler(
    Session: SessionFactory,
    settings: Settings,
    ws_manager: ConnectionManager,
    cache: dict[str, Any],
    crypto: Crypto,
    emergency_store: EmergencyStore,
) -> None:
    ujin_client = UjinClient(settings)
    token = settings.ujin_token

    fast_kwargs = dict(Session=Session, ujin_client=ujin_client, ws_manager=ws_manager, cache=cache, token=token)
    medium_kwargs = dict(Session=Session, ujin_client=ujin_client, ws_manager=ws_manager, cache=cache, token=token)
    daily_kwargs = dict(Session=Session, ujin_client=ujin_client, ws_manager=ws_manager, cache=cache, token=token, crypto=crypto)

    await sync_daily(**daily_kwargs)
    await asyncio.gather(
        sync_medium(**medium_kwargs),
        sync_fast(**fast_kwargs),
    )

    async def loop_fast() -> None:
        while True:
            await asyncio.sleep(settings.poll_interval_fast)
            await sync_fast(**fast_kwargs)

    async def loop_medium() -> None:
        while True:
            await asyncio.sleep(settings.poll_interval_medium)
            await sync_medium(**medium_kwargs)

    async def loop_daily() -> None:
        while True:
            await asyncio.sleep(settings.poll_interval_daily)
            await sync_daily(**daily_kwargs)

    await asyncio.gather(
        loop_fast(),
        loop_medium(),
        loop_daily(),
        _loop_emergency_auto_reset(Session, emergency_store, ws_manager),
    )