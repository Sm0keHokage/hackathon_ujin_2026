from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func
from app.db.orm import Screen
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
        result = await session.execute(select(Screen).order_by(Screen.name))
        rows = result.scalars().all()

    return [
        ScreenInfo(
            tablo_id=r.tablo_id,
            name=r.name,
            group_name=r.group_name,
            is_online=r.is_online,
            last_seen_at=r.last_seen_at.isoformat() if r.last_seen_at else None,
        )
        for r in rows
    ]
