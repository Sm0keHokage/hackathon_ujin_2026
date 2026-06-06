from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func
from app.crypto import Crypto
from app.db.orm import Building, Complex
from app.db.session import SessionFactory
from app.models import BuildingSummary


async def upsert_all(
    Session: SessionFactory,
    buildings: list[BuildingSummary],
    complexes: list[dict],
    crypto: Crypto,
) -> None:
    if not buildings:
        return

    async with Session() as session:
        stmt = pg_insert(Complex).values([
            {"id": c["id"], "title": c["title"], "region": c.get("region", {}).get("title")}
            for c in complexes
        ])
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={"title": stmt.excluded.title, "synced_at": func.now()},
        )
        await session.execute(stmt)

        stmt = pg_insert(Building).values([
            {
                "id": b.id,
                "complex_id": b.complex_id or (complexes[0]["id"] if complexes else 0),
                "title": b.title,
                "address": b.address,
                "floors": b.floors,
                "apartments": b.apartments,
                "entrances": b.entrances,
                "security_number_enc": crypto.encrypt(b.security_number) if b.security_number else None,
                "guest_scud_pass_limit": b.guest_scud_pass_limit,
                "meters_mode": b.meters_mode,
            }
            for b in buildings
        ])
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "title": stmt.excluded.title,
                "address": stmt.excluded.address,
                "floors": stmt.excluded.floors,
                "apartments": stmt.excluded.apartments,
                "entrances": stmt.excluded.entrances,
                "security_number_enc": stmt.excluded.security_number_enc,
                "guest_scud_pass_limit": stmt.excluded.guest_scud_pass_limit,
                "meters_mode": stmt.excluded.meters_mode,
                "synced_at": func.now(),
            },
        )
        await session.execute(stmt)
        await session.commit()


async def get_all(Session: SessionFactory, crypto: Crypto) -> list[BuildingSummary]:
    async with Session() as session:
        result = await session.execute(select(Building).order_by(Building.id))
        rows = result.scalars().all()

    return [
        BuildingSummary(
            id=r.id,
            title=r.title,
            address=r.address,
            floors=r.floors,
            apartments=r.apartments,
            entrances=r.entrances,
            security_number=crypto.decrypt(r.security_number_enc),
            guest_scud_pass_limit=r.guest_scud_pass_limit,
            meters_mode=r.meters_mode,
        )
        for r in rows
    ]
