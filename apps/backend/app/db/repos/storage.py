from sqlalchemy import select
from app.db.orm import StorageSnapshot
from app.db.session import SessionFactory
from app.models import ResourceSummary


async def insert_snapshot(Session: SessionFactory, building_id: int, summary: ResourceSummary) -> None:
    async with Session() as session:
        session.add(StorageSnapshot(
            building_id=building_id,
            total=summary.total,
            free=summary.free,
            occupied=summary.occupied,
            public=summary.public,
            private=summary.private,
            unassigned=summary.unassigned,
        ))
        await session.commit()


async def get_latest(Session: SessionFactory) -> dict[int, ResourceSummary]:
    async with Session() as session:
        result = await session.execute(
            select(StorageSnapshot)
            .distinct(StorageSnapshot.building_id)
            .order_by(StorageSnapshot.building_id, StorageSnapshot.snapped_at.desc())
        )
        rows = result.scalars().all()

    return {
        r.building_id: ResourceSummary(
            total=r.total,
            free=r.free,
            occupied=r.occupied,
            public=r.public,
            private=r.private,
            unassigned=r.unassigned,
        )
        for r in rows
    }
