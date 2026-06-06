from sqlalchemy import select
from app.db.orm import WeatherCache
from app.db.session import SessionFactory


async def upsert(Session: SessionFactory, type_: str, data: dict) -> None:
    async with Session() as session:
        session.add(WeatherCache(type=type_, data_json=data, source="openweathermap"))
        await session.commit()


async def get_latest(Session: SessionFactory, type_: str) -> dict | None:
    async with Session() as session:
        result = await session.execute(
            select(WeatherCache)
            .where(WeatherCache.type == type_)
            .order_by(WeatherCache.synced_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
    return row.data_json if row else None


async def get_all_latest(Session: SessionFactory) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for type_ in ("current", "hourly", "daily"):
        data = await get_latest(Session, type_)
        if data is not None:
            out[type_] = data
    return out