from typing import Any
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func
from app.db.orm import Screen, ScreenTemplate, Template
from app.db.session import SessionFactory


async def list_all(Session: SessionFactory) -> list[Template]:
    async with Session() as session:
        result = await session.execute(select(Template).order_by(Template.id))
        return list(result.scalars().all())


async def get(Session: SessionFactory, template_id: int) -> Template | None:
    async with Session() as session:
        return await session.get(Template, template_id)


async def create(
    Session: SessionFactory,
    name: str,
    config_json: dict[str, Any],
    preview_url: str | None = None,
) -> Template:
    async with Session() as session:
        tpl = Template(name=name, config_json=config_json, preview_url=preview_url)
        session.add(tpl)
        await session.flush()
        await session.commit()
        await session.refresh(tpl)
        return tpl


async def update(
    Session: SessionFactory,
    template_id: int,
    *,
    name: str | None = None,
    config_json: dict[str, Any] | None = None,
    preview_url: str | None = None,
) -> Template | None:
    async with Session() as session:
        tpl = await session.get(Template, template_id)
        if tpl is None:
            return None
        if name is not None:
            tpl.name = name
        if config_json is not None:
            tpl.config_json = config_json
        if preview_url is not None:
            tpl.preview_url = preview_url
        tpl.updated_at = func.now()
        await session.commit()
        await session.refresh(tpl)
        return tpl


async def delete_by_id(Session: SessionFactory, template_id: int) -> bool:
    async with Session() as session:
        await session.execute(
            delete(ScreenTemplate).where(ScreenTemplate.template_id == template_id)
        )
        tpl = await session.get(Template, template_id)
        if tpl is None:
            await session.rollback()
            return False
        await session.delete(tpl)
        await session.commit()
        return True


async def assign_to_screen(
    Session: SessionFactory,
    tablo_id: str,
    template_id: int,
) -> None:
    async with Session() as session:
        await session.execute(
            pg_insert(Screen).values(
                tablo_id=tablo_id, name=tablo_id, is_online=False, created_at=func.now()
            ).on_conflict_do_nothing(index_elements=["tablo_id"])
        )
        stmt = pg_insert(ScreenTemplate).values(
            tablo_id=tablo_id,
            template_id=template_id,
            assigned_at=func.now(),
        ).on_conflict_do_update(
            index_elements=["tablo_id"],
            set_={"template_id": template_id, "assigned_at": func.now()},
        )
        await session.execute(stmt)
        await session.commit()


async def unassign_screen(Session: SessionFactory, tablo_id: str) -> None:
    async with Session() as session:
        await session.execute(
            delete(ScreenTemplate).where(ScreenTemplate.tablo_id == tablo_id)
        )
        await session.commit()


async def get_tablo_ids_by_target(
    Session: SessionFactory,
    mode: str,
    tablo_ids: list[str] | None = None,
    group_names: list[str] | None = None,
) -> list[str]:
    async with Session() as session:
        if mode == "all":
            result = await session.execute(select(Screen.tablo_id))
            return list(result.scalars().all())
        elif mode == "groups":
            if not group_names:
                return []
            result = await session.execute(
                select(Screen.tablo_id).where(Screen.group_name.in_(group_names))
            )
            return list(result.scalars().all())
        elif mode == "screens":
            return tablo_ids or []
        return []


async def bulk_assign_to_targets(
    Session: SessionFactory,
    template_id: int,
    tablo_ids: list[str],
) -> None:
    if not tablo_ids:
        return
    async with Session() as session:
        for tid in tablo_ids:
            await session.execute(
                pg_insert(Screen).values(
                    tablo_id=tid, name=tid, is_online=False, created_at=func.now()
                ).on_conflict_do_nothing(index_elements=["tablo_id"])
            )
            stmt = pg_insert(ScreenTemplate).values(
                tablo_id=tid,
                template_id=template_id,
                assigned_at=func.now(),
            ).on_conflict_do_update(
                index_elements=["tablo_id"],
                set_={"template_id": template_id, "assigned_at": func.now()},
            )
            await session.execute(stmt)
        await session.commit()
