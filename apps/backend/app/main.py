import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
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
from app.models import EmergencyState, EmergencyUpdate, LobbyOverview, ScreenInfo, SyncStatus
from app.scheduler import run_scheduler
from app.services import EmergencyStore, build_overview_from_cache
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

    scheduler_task = asyncio.create_task(
        run_scheduler(Session, settings, ws_manager, cache, crypto, emergency_store)
    )

    yield

    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
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
    await ws_manager.send_to(tablo_id, {"type": "emergency", "data": emergency_store.get().model_dump()})

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


@app.get("/api/emergency/state", response_model=EmergencyState)
async def emergency_state(request: Request) -> EmergencyState:
    return request.app.state.emergency_store.get()


@app.post("/api/emergency/activate", response_model=EmergencyState)
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

    log_id = await emergency_log_repo.log_activation(
        Session,
        tablo_ids=update.tablo_ids or ["all"],
        emergency_text=update.message,
        priority=update.priority,
        auto_reset_sec=auto_reset_sec,
    )

    state = emergency_store.activate(
        EmergencyState(
            active=True,
            title=update.title,
            message=update.message,
            tablo_ids=update.tablo_ids,
            affected_buildings=update.affected_buildings,
            priority=update.priority,
            log_id=log_id,
            auto_reset_at=auto_reset_at,
        )
    )

    payload = {"type": "emergency", "data": state.model_dump(mode="json")}
    await ws_manager.broadcast_to(update.tablo_ids, payload)
    return state


@app.post("/api/emergency/deactivate", response_model=EmergencyState)
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


@app.get("/api/screens", response_model=list[ScreenInfo])
async def list_screens(request: Request) -> list[ScreenInfo]:
    return await screens_repo.get_all(request.app.state.Session)


@app.get("/api/sync/status", response_model=list[SyncStatus])
async def sync_status(request: Request) -> list[SyncStatus]:
    return await sync_log_repo.get_latest_per_source(request.app.state.Session)