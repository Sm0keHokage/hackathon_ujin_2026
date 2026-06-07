import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.config import Settings, get_settings
from app.crypto import Crypto
from app.db.session import make_engine, make_session_factory
from app.db.repos import buildings as buildings_repo
from app.db.repos import emergency_log as emergency_log_repo
from app.db.repos import news as news_repo
from app.db.repos import parking as parking_repo
from app.db.repos import screens as screens_repo
from app.db.repos import storage as storage_repo
from app.db.repos import sync_log as sync_log_repo
from app.db.repos import templates as templates_repo
from app.db.repos import weather as weather_repo
from app.db.repos import static_content as static_content_repo
from app.dashboard import DashboardConfig
from app.dashboard_builder import build_dashboard_config
from app.models import (
    BulkTemplateAssign,
    EmergencyState,
    EmergencyUpdate,
    LobbyOverview,
    ScreenInfo,
    SyncStatus,
    TemplateAssign,
    TemplateCreate,
    TemplateInfo,
    TemplateUpdate,
    WeatherAll,
    WeatherCurrent,
    WeatherDaily,
    WeatherHourly,
)
from app.scheduler import run_scheduler
from app.services import EmergencyStore, build_overview_from_cache
from app.weather_client import WeatherClient
from app.ws.manager import ConnectionManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()

    engine = make_engine(settings.database_url)
    Session = make_session_factory(engine)
    crypto = Crypto(settings.encryption_key or None)
    ws_manager = ConnectionManager()
    emergency_store = EmergencyStore()
    cache: dict[str, Any] = {}

    app.state.Session = Session
    app.state.ws_manager = ws_manager
    app.state.emergency_store = emergency_store
    app.state.cache = cache
    app.state.crypto = crypto
    app.state.settings = settings

    try:
        cache["buildings"] = await buildings_repo.get_all(Session, crypto)
        cache["parking"] = await parking_repo.get_latest(Session)
        cache["storage"] = await storage_repo.get_latest(Session)
        cache["news"] = await news_repo.get_active(Session)
        logger.info(
            "Cache warm from DB: %d buildings, %d news",
            len(cache["buildings"]),
            len(cache["news"]),
        )
    except Exception as exc:
        logger.warning("Could not warm cache from DB: %s", exc)

    try:
        active = await emergency_log_repo.get_active(Session)
        if active is not None:
            emergency_store.activate(
                EmergencyState(
                    active=True,
                    title="Внимание жильцам",
                    message=active.emergency_text,
                    tablo_ids=active.tablo_ids or [],
                    priority=active.priority,
                    log_id=active.id,
                    auto_reset_at=active.auto_reset_at,
                )
            )
            logger.info("Emergency state restored from DB (log_id=%d)", active.id)
    except Exception as exc:
        logger.warning("Could not restore emergency state: %s", exc)

    weather_client: WeatherClient | None = None
    if settings.openweather_api_key:
        weather_client = WeatherClient(settings.openweather_api_key)
        try:
            w = await weather_repo.get_all_latest(Session)
            if w.get("current"):
                cache["weather_current"] = w["current"]
            if w.get("hourly"):
                cache["weather_hourly"] = w["hourly"]
            if w.get("daily"):
                cache["weather_daily"] = w["daily"]
            logger.info("Cache warm from DB: weather types=%s", list(w.keys()))
        except Exception as exc:
            logger.warning("Could not warm weather cache from DB: %s", exc)
    else:
        logger.warning("OPENWEATHER_API_KEY not set — weather sync disabled")

    app.state.weather_client = weather_client

    scheduler_task = asyncio.create_task(
        run_scheduler(Session, settings, ws_manager, cache, crypto, emergency_store, weather_client)
    )

    yield

    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    if weather_client is not None:
        await weather_client.close()
    await engine.dispose()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Smart Lobby OS API", version="0.4.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


app = create_app()


def require_admin(
    request: Request,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    expected = request.app.state.settings.admin_token
    if not expected:
        raise HTTPException(status_code=503, detail="Admin token is not configured on the server")
    if x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/lobby")
async def websocket_lobby(
    websocket: WebSocket,
    tablo_id: str = Query(default="display"),
) -> None:
    ws_manager: ConnectionManager = websocket.app.state.ws_manager
    cache: dict = websocket.app.state.cache
    emergency_store: EmergencyStore = websocket.app.state.emergency_store
    Session = websocket.app.state.Session

    await ws_manager.connect(tablo_id, websocket)
    await screens_repo.upsert_online(Session, tablo_id)

    overview = build_overview_from_cache(cache)
    if overview:
        await ws_manager.send_to(tablo_id, {"type": "overview", "data": overview.model_dump()})

    try:
        dashboard = await build_dashboard_config(Session, cache, tablo_id)
        await ws_manager.send_to(
            tablo_id,
            {"type": "dashboard", "data": dashboard.model_dump(mode="json", by_alias=True)},
        )
    except Exception as exc:
        logger.warning("Could not build dashboard for %s: %s", tablo_id, exc)

    await ws_manager.send_to(tablo_id, {"type": "emergency", "data": emergency_store.get().model_dump()})

    weather_payload: dict = {}
    if cache.get("weather_current"):
        weather_payload["current"] = cache["weather_current"]
    if cache.get("weather_hourly"):
        weather_payload["hourly"] = cache["weather_hourly"]
    if cache.get("weather_daily"):
        weather_payload["daily"] = cache["weather_daily"]
    if weather_payload:
        await ws_manager.send_to(tablo_id, {"type": "weather", "data": weather_payload})

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(tablo_id)
        await screens_repo.mark_offline(Session, tablo_id)


@app.get("/api/lobby/overview", response_model=LobbyOverview)
async def lobby_overview(request: Request) -> LobbyOverview:
    overview = build_overview_from_cache(request.app.state.cache)
    if overview is None:
        raise HTTPException(status_code=503, detail="Data not yet loaded. Try again in a few seconds.")
    return overview


@app.get(
    "/api/dashboard/config",
    response_model=DashboardConfig,
    response_model_by_alias=True,
)
async def dashboard_config(
    request: Request,
    tablo_id: str = Query(default="display"),
) -> DashboardConfig:
    Session = request.app.state.Session
    cache = request.app.state.cache
    return await build_dashboard_config(Session, cache, tablo_id)


@app.get("/api/emergency/state", response_model=EmergencyState)
async def emergency_state(request: Request) -> EmergencyState:
    return request.app.state.emergency_store.get()


@app.post("/api/emergency/activate", response_model=EmergencyState, dependencies=[Depends(require_admin)])
async def activate_emergency(update: EmergencyUpdate, request: Request) -> EmergencyState:
    emergency_store: EmergencyStore = request.app.state.emergency_store
    ws_manager: ConnectionManager = request.app.state.ws_manager
    Session = request.app.state.Session
    settings: Settings = request.app.state.settings

    auto_reset_sec = settings.emergency_auto_reset_sec
    auto_reset_at = (
        datetime.now(timezone.utc) + timedelta(seconds=auto_reset_sec)
        if auto_reset_sec > 0
        else None
    )

    tablo_ids = update.tablo_ids
    if update.target:
        tablo_ids = await templates_repo.get_tablo_ids_by_target(
            Session,
            mode=update.target.mode,
            tablo_ids=update.target.tablo_ids,
            group_names=update.target.group_names,
        )

    log_id = await emergency_log_repo.log_activation(
        Session,
        tablo_ids=tablo_ids or ["all"],
        emergency_text=update.message,
        priority=update.priority,
        auto_reset_sec=auto_reset_sec,
    )

    state = emergency_store.activate(
        EmergencyState(
            active=True,
            title=update.title,
            message=update.message,
            tablo_ids=tablo_ids,
            affected_buildings=update.affected_buildings,
            priority=update.priority,
            log_id=log_id,
            auto_reset_at=auto_reset_at,
        )
    )

    payload = {"type": "emergency", "data": state.model_dump(mode="json")}
    if tablo_ids:
        await ws_manager.broadcast_to(tablo_ids, payload)
    else:
        await ws_manager.broadcast_all(payload)
    return state


@app.post("/api/emergency/deactivate", response_model=EmergencyState, dependencies=[Depends(require_admin)])
async def deactivate_emergency(request: Request) -> EmergencyState:
    emergency_store: EmergencyStore = request.app.state.emergency_store
    ws_manager: ConnectionManager = request.app.state.ws_manager
    Session = request.app.state.Session

    current = emergency_store.get()
    if current.log_id is not None:
        await emergency_log_repo.log_deactivation(Session, current.log_id)

    state = emergency_store.deactivate()
    await ws_manager.broadcast_all({"type": "emergency", "data": state.model_dump(mode="json")})
    return state


@app.get("/api/screens", response_model=list[ScreenInfo], dependencies=[Depends(require_admin)])
async def list_screens(request: Request) -> list[ScreenInfo]:
    return await screens_repo.get_all(request.app.state.Session)


@app.get("/api/sync/status", response_model=list[SyncStatus])
async def sync_status(request: Request) -> list[SyncStatus]:
    return await sync_log_repo.get_latest_per_source(request.app.state.Session)


def _template_to_info(tpl) -> TemplateInfo:
    return TemplateInfo(
        id=tpl.id,
        name=tpl.name,
        preview_url=tpl.preview_url,
        config_json=tpl.config_json,
        created_at=tpl.created_at,
        updated_at=tpl.updated_at,
    )


@app.get("/api/templates", response_model=list[TemplateInfo], dependencies=[Depends(require_admin)])
async def list_templates(request: Request) -> list[TemplateInfo]:
    tpls = await templates_repo.list_all(request.app.state.Session)
    return [_template_to_info(t) for t in tpls]


@app.get("/api/templates/{template_id}", response_model=TemplateInfo, dependencies=[Depends(require_admin)])
async def get_template(template_id: int, request: Request) -> TemplateInfo:
    tpl = await templates_repo.get(request.app.state.Session, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_to_info(tpl)


@app.post(
    "/api/templates",
    response_model=TemplateInfo,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
async def create_template(payload: TemplateCreate, request: Request) -> TemplateInfo:
    tpl = await templates_repo.create(
        request.app.state.Session,
        name=payload.name,
        config_json=payload.config_json.model_dump(mode="json", by_alias=True, exclude_none=True),
        preview_url=payload.preview_url,
    )
    return _template_to_info(tpl)


@app.patch(
    "/api/templates/{template_id}",
    response_model=TemplateInfo,
    dependencies=[Depends(require_admin)],
)
async def update_template(
    template_id: int, payload: TemplateUpdate, request: Request
) -> TemplateInfo:
    config_json = None
    if payload.config_json is not None:
        config_json = payload.config_json.model_dump(mode="json", by_alias=True, exclude_none=True)

    tpl = await templates_repo.update(
        request.app.state.Session,
        template_id,
        name=payload.name,
        config_json=config_json,
        preview_url=payload.preview_url,
    )
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_to_info(tpl)


@app.delete(
    "/api/templates/{template_id}",
    status_code=204,
    dependencies=[Depends(require_admin)],
)
async def delete_template(template_id: int, request: Request) -> None:
    ok = await templates_repo.delete_by_id(request.app.state.Session, template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")


@app.post(
    "/api/templates/assign",
    status_code=204,
    dependencies=[Depends(require_admin)],
)
async def assign_template(payload: TemplateAssign, request: Request) -> None:
    Session = request.app.state.Session
    if (await templates_repo.get(Session, payload.template_id)) is None:
        raise HTTPException(status_code=404, detail="Template not found")
    await templates_repo.assign_to_screen(Session, payload.tablo_id, payload.template_id)
    ws_manager: ConnectionManager = request.app.state.ws_manager
    cache = request.app.state.cache
    try:
        cfg = await build_dashboard_config(Session, cache, payload.tablo_id)
        await ws_manager.send_to(
            payload.tablo_id,
            {"type": "dashboard", "data": cfg.model_dump(mode="json", by_alias=True)},
        )
    except Exception as exc:
        logger.warning("Could not push dashboard after assign: %s", exc)


@app.post(
    "/api/templates/assign-target",
    status_code=204,
    dependencies=[Depends(require_admin)],
)
async def assign_template_bulk(payload: BulkTemplateAssign, request: Request) -> None:
    Session = request.app.state.Session
    if (await templates_repo.get(Session, payload.template_id)) is None:
        raise HTTPException(status_code=404, detail="Template not found")

    tablo_ids = await templates_repo.get_tablo_ids_by_target(
        Session,
        mode=payload.target.mode,
        tablo_ids=payload.target.tablo_ids,
        group_names=payload.target.group_names,
    )

    if not tablo_ids:
        return

    await templates_repo.bulk_assign_to_targets(Session, payload.template_id, tablo_ids)

    ws_manager: ConnectionManager = request.app.state.ws_manager
    cache = request.app.state.cache
    for tid in tablo_ids:
        try:
            cfg = await build_dashboard_config(Session, cache, tid)
            await ws_manager.send_to(
                tid,
                {"type": "dashboard", "data": cfg.model_dump(mode="json", by_alias=True)},
            )
        except Exception as exc:
            logger.warning("Could not push dashboard to %s after bulk assign: %s", tid, exc)


@app.delete(
    "/api/templates/assign/{tablo_id}",
    status_code=204,
    dependencies=[Depends(require_admin)],
)
async def unassign_template(tablo_id: str, request: Request) -> None:
    await templates_repo.unassign_screen(request.app.state.Session, tablo_id)


@app.get("/api/weather", response_model=WeatherAll)
async def weather_all(request: Request) -> WeatherAll:
    cache = request.app.state.cache
    return WeatherAll(
        current=WeatherCurrent(**cache["weather_current"]) if cache.get("weather_current") else None,
        hourly=WeatherHourly(**cache["weather_hourly"]) if cache.get("weather_hourly") else None,
        daily=WeatherDaily(**cache["weather_daily"]) if cache.get("weather_daily") else None,
    )


@app.get("/api/weather/current", response_model=WeatherCurrent)
async def weather_current(request: Request) -> WeatherCurrent:
    data = request.app.state.cache.get("weather_current")
    if data is None:
        raise HTTPException(status_code=503, detail="Weather data not yet loaded.")
    return WeatherCurrent(**data)


@app.get("/api/weather/hourly", response_model=WeatherHourly)
async def weather_hourly(request: Request) -> WeatherHourly:
    data = request.app.state.cache.get("weather_hourly")
    if data is None:
        raise HTTPException(status_code=503, detail="Weather data not yet loaded.")
    return WeatherHourly(**data)


@app.get("/api/weather/daily", response_model=WeatherDaily)
async def weather_daily(request: Request) -> WeatherDaily:
    data = request.app.state.cache.get("weather_daily")
    if data is None:
        raise HTTPException(status_code=503, detail="Weather data not yet loaded.")
    return WeatherDaily(**data)


@app.get("/api/weather/location")
async def get_weather_location(request: Request) -> dict:
    Session = request.app.state.Session
    settings: Settings = request.app.state.settings
    address = await static_content_repo.get_value(Session, "weather_location") or settings.openweather_address
    return {"address": address}


@app.put("/api/weather/location", dependencies=[Depends(require_admin)])
async def set_weather_location(
    request: Request,
    address: str = Body(..., embed=True),
) -> dict:
    Session = request.app.state.Session
    weather_client: WeatherClient | None = request.app.state.weather_client
    if not address.strip():
        raise HTTPException(status_code=422, detail="address cannot be empty")
    await static_content_repo.set_value(Session, "weather_location", address.strip())
    if weather_client is not None:
        weather_client._geocache.clear()
    return {"address": address.strip()}