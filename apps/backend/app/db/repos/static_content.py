from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func
from app.db.orm import StaticContent
from app.db.session import SessionFactory


async def get_value(Session: SessionFactory, key: str) -> str | None:
    async with Session() as session:
        result = await session.execute(
            select(StaticContent.value).where(StaticContent.key == key)
        )
        return result.scalar_one_or_none()


async def set_value(Session: SessionFactory, key: str, value: str, title: str | None = None) -> None:
    async with Session() as session:
        stmt = pg_insert(StaticContent).values(
            key=key, title=title or key, value=value
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["key"],
            set_={"value": stmt.excluded.value, "updated_at": func.now()},
        )
        await session.execute(stmt)
        await session.commit()