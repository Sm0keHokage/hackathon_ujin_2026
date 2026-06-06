import logging
from sqlalchemy import delete, literal_column
from sqlalchemy.sql import func
from app.db.orm import ParkingSnapshot, StorageSnapshot, SyncLog, WeatherCache
from app.db.session import SessionFactory

logger = logging.getLogger(__name__)


async def cleanup_old_data(Session: SessionFactory) -> None:
    async with Session() as session:
        await session.execute(
            delete(ParkingSnapshot).where(
                ParkingSnapshot.snapped_at < func.now() - literal_column("INTERVAL '24 hours'")
            )
        )
        await session.execute(
            delete(StorageSnapshot).where(
                StorageSnapshot.snapped_at < func.now() - literal_column("INTERVAL '24 hours'")
            )
        )
        await session.execute(
            delete(WeatherCache).where(
                WeatherCache.synced_at < func.now() - literal_column("INTERVAL '2 hours'")
            )
        )
        await session.execute(
            delete(SyncLog).where(
                SyncLog.synced_at < func.now() - literal_column("INTERVAL '7 days'")
            )
        )
        await session.commit()
    logger.info("Old data cleaned up")
