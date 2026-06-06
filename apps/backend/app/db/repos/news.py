import datetime
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func
from app.db.orm import News
from app.db.session import SessionFactory
from app.models import NewsSummary


async def upsert_all(Session: SessionFactory, items: list[NewsSummary]) -> None:
    if not items:
        return

    async with Session() as session:
        stmt = pg_insert(News).values([
            {
                "id": item.id,
                "title": item.title,
                "date": datetime.date.fromisoformat(item.date) if item.date else None,
                "text": item.text,
                "priority": item.priority,
                "buildings": item.buildings,
            }
            for item in items
        ])
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "title": stmt.excluded.title,
                "date": stmt.excluded.date,
                "text": stmt.excluded.text,
                "priority": stmt.excluded.priority,
                "buildings": stmt.excluded.buildings,
                "synced_at": func.now(),
            },
        )
        await session.execute(stmt)
        await session.commit()


async def get_active(Session: SessionFactory) -> list[NewsSummary]:
    async with Session() as session:
        result = await session.execute(
            select(News)
            .where(or_(News.expires_at.is_(None), News.expires_at > func.now()))
            .order_by(News.date.desc())
            .limit(20)
        )
        rows = result.scalars().all()

    return [
        NewsSummary(
            id=r.id,
            title=r.title,
            date=r.date.isoformat() if r.date else None,
            text=r.text,
            priority=r.priority,
            buildings=r.buildings,
        )
        for r in rows
    ]
