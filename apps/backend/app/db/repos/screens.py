from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func
from app.db.orm import Screen, ScreenTemplate, Template
from app.db.session import SessionFactory
from app.models import ScreenInfo


async def upsert_online(Session: SessionFactory, tablo_id: str, name: str | None = None) -> None:
    async with Session() as session:
        stmt = pg_insert(Screen).values(
            tablo_id=tablo_id,
            name=name or tablo_id,
            is_online=True,
            last_seen_at=func.now(),
        ).on_conflict_do_update(
            index_elements=["tablo_id"],
            set_={"is_online": True, "last_seen_at": func.now()},
        )
        await session.execute(stmt)
        await session.commit()


async def mark_offline(Session: SessionFactory, tablo_id: str) -> None:
    async with Session() as session:
        await session.execute(
            sa_update(Screen).where(Screen.tablo_id == tablo_id).values(is_online=False)
        )
        await session.commit()


async def get_all(Session: SessionFactory) -> list[ScreenInfo]:
    async with Session() as session:
        stmt = (
            select(
                Screen,
                Template.id.label("tpl_id"),
                Template.name.label("tpl_name"),
                ScreenTemplate.assigned_at
            )
            .outerjoin(ScreenTemplate, Screen.tablo_id == ScreenTemplate.tablo_id)
            .outerjoin(Template, ScreenTemplate.template_id == Template.id)
            .order_by(Screen.name)
        )
        result = await session.execute(stmt)
        rows = result.all()

    return [
        ScreenInfo(
            tablo_id=r.Screen.tablo_id,
            name=r.Screen.name,
            group_name=r.Screen.group_name,
            is_online=r.Screen.is_online,
            last_seen_at=r.Screen.last_seen_at.isoformat() if r.Screen.last_seen_at else None,
            assigned_template_id=r.tpl_id,
            assigned_template_name=r.tpl_name,
            assigned_at=r.assigned_at,
        )
        for r in rows
    ]
