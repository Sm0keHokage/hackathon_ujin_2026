import logging
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import select

logger = logging.getLogger(__name__)
from app.dashboard import (
    Accent,
    ClockTile,
    DashboardConfig,
    DashboardGrid,
    GridPoint,
    MetricTile,
    NoticeItem,
    NoticeListTile,
    TextTile,
    TileLayout,
)
from app.db.orm import ScreenTemplate, StaticContent, Template
from app.db.session import SessionFactory
from app.models import BuildingSummary, NewsSummary, ResourceSummary


_DEFAULT_GRID = DashboardGrid(columns=9, rows=16, gap=16)


def _layout(x1: int, y1: int, x2: int, y2: int) -> TileLayout:
    return TileLayout(top_left=GridPoint(x=x1, y=y1), bottom_right=GridPoint(x=x2, y=y2))


def _free_status(free: int, total: int) -> Accent:
    if total == 0:
        return "info"
    ratio = free / total
    if ratio < 0.05:
        return "critical"
    if ratio < 0.15:
        return "warning"
    return "success"


async def _load_static(Session: SessionFactory) -> dict[str, dict[str, str | None]]:
    async with Session() as session:
        rows = (await session.execute(select(StaticContent))).scalars().all()
    return {r.key: {"title": r.title, "value": r.value} for r in rows}


async def _load_assigned_template_json(
    Session: SessionFactory, tablo_id: str
) -> dict[str, Any] | None:
    async with Session() as session:
        result = await session.execute(
            select(Template.config_json)
            .join(ScreenTemplate, ScreenTemplate.template_id == Template.id)
            .where(ScreenTemplate.tablo_id == tablo_id)
            .limit(1)
        )
        return result.scalar_one_or_none()


def _build_default_tiles(
    buildings: list[BuildingSummary],
    parking: dict[int, ResourceSummary],
    storage: dict[int, ResourceSummary],
    news: list[NewsSummary],
    static: dict[str, dict[str, str | None]],
) -> list:
    park_total = sum(parking.get(b.id, ResourceSummary()).total for b in buildings)
    park_free = sum(parking.get(b.id, ResourceSummary()).free for b in buildings)
    stor_total = sum(storage.get(b.id, ResourceSummary()).total for b in buildings)
    stor_free = sum(storage.get(b.id, ResourceSummary()).free for b in buildings)

    tiles: list = [
        ClockTile(
            id="clock",
            title="Сегодня",
            timezone="Europe/Moscow",
            subtitle="Пермь",
            layout=_layout(1, 1, 9, 3),
        ),
        MetricTile(
            id="parking",
            title="Свободные парковки",
            value=str(park_free),
            unit=f"из {park_total}",
            caption=f"{len(buildings)} зданий в ЖК",
            status=_free_status(park_free, park_total),
            layout=_layout(1, 4, 5, 6),
        ),
        MetricTile(
            id="storage",
            title="Свободные кладовые",
            value=str(stor_free),
            unit=f"из {stor_total}",
            status=_free_status(stor_free, stor_total),
            layout=_layout(6, 4, 9, 6),
        ),
        NoticeListTile(
            id="news",
            title="Новости УК",
            items=[
                NoticeItem(
                    id=f"n-{n.id}",
                    title=n.title,
                    text=n.text,
                    date=n.date,
                    severity="warning" if n.priority == "high" else "info",
                )
                for n in news[:6]
            ],
            layout=_layout(1, 7, 9, 12),
        ),
    ]

    rules = static.get("rules") or {}
    trash = static.get("trash_schedule") or {}
    emerg = static.get("emergency_contacts") or {}

    tiles.append(
        TextTile(
            id="rules",
            title=str(rules.get("title") or "Правила ЖК"),
            body=str(rules.get("value") or "—"),
            layout=_layout(1, 13, 5, 14),
        )
    )
    tiles.append(
        TextTile(
            id="trash",
            title=str(trash.get("title") or "Вывоз мусора"),
            body=str(trash.get("value") or "—"),
            layout=_layout(6, 13, 9, 14),
        )
    )
    tiles.append(
        TextTile(
            id="emergency-contacts",
            title=str(emerg.get("title") or "Аварийная служба"),
            body=str(emerg.get("value") or "—"),
            footer="круглосуточно",
            accent="info",
            layout=_layout(1, 15, 9, 16),
        )
    )

    return tiles


async def build_dashboard_config(
    Session: SessionFactory,
    cache: dict[str, Any],
    tablo_id: str = "display",
) -> DashboardConfig:
    static = await _load_static(Session)
    assigned = await _load_assigned_template_json(Session, tablo_id)
    if assigned:
        try:
            return DashboardConfig.model_validate(assigned)
        except Exception as exc:
            logger.warning("Template validation failed for tablo_id=%s: %s", tablo_id, exc)

    buildings: list[BuildingSummary] = cache.get("buildings") or []
    parking: dict[int, ResourceSummary] = cache.get("parking") or {}
    storage: dict[int, ResourceSummary] = cache.get("storage") or {}
    news: list[NewsSummary] = cache.get("news") or []

    complex_title = "ЖК"
    address = "—"
    if buildings:
        address = buildings[0].address or address

    tiles = _build_default_tiles(buildings, parking, storage, news, static)

    return DashboardConfig(
        id=f"default-{tablo_id}",
        title=complex_title,
        address=address,
        updated_at=datetime.now(timezone.utc).isoformat(),
        grid=_DEFAULT_GRID,
        tiles=tiles,
    )