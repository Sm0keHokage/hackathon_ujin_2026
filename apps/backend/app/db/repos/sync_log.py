from sqlalchemy import select
from app.db.orm import SyncLog
from app.db.session import SessionFactory
from app.models import SyncStatus


async def insert_log(
    Session: SessionFactory,
    source: str,
    status: str,
    duration_ms: int,
    error: str | None = None,
) -> None:
    async with Session() as session:
        session.add(SyncLog(source=source, status=status, duration_ms=duration_ms, error=error))
        await session.commit()


async def get_latest_per_source(Session: SessionFactory) -> list[SyncStatus]:
    async with Session() as session:
        result = await session.execute(
            select(SyncLog)
            .distinct(SyncLog.source)
            .order_by(SyncLog.source, SyncLog.synced_at.desc())
        )
        rows = result.scalars().all()

    return [
        SyncStatus(
            source=r.source,
            status=r.status,
            duration_ms=r.duration_ms,
            error=r.error,
            synced_at=r.synced_at.isoformat() if r.synced_at else None,
        )
        for r in rows
    ]
