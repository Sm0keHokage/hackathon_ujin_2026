from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.sql import func
from app.db.orm import EmergencyLog
from app.db.session import SessionFactory


async def log_activation(
    Session: SessionFactory,
    tablo_ids: list[str],
    emergency_text: str,
    priority: int = 1,
    activated_by: str = "uk_panel",
    auto_reset_sec: int = 0,
) -> int:
    auto_reset_at = (
        datetime.now(timezone.utc) + timedelta(seconds=auto_reset_sec)
        if auto_reset_sec > 0
        else None
    )
    async with Session() as session:
        log = EmergencyLog(
            tablo_ids=tablo_ids,
            emergency_text=emergency_text,
            priority=priority,
            activated_by=activated_by,
            auto_reset_at=auto_reset_at,
        )
        session.add(log)
        await session.flush()
        log_id = log.id
        await session.commit()
    return log_id


async def log_deactivation(Session: SessionFactory, log_id: int) -> None:
    async with Session() as session:
        await session.execute(
            sa_update(EmergencyLog)
            .where(EmergencyLog.id == log_id)
            .values(deactivated_at=func.now())
        )
        await session.commit()


async def get_active_log_id(Session: SessionFactory) -> int | None:
    async with Session() as session:
        result = await session.execute(
            select(EmergencyLog.id)
            .where(EmergencyLog.deactivated_at.is_(None))
            .order_by(EmergencyLog.activated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
