"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-06 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "complexes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("region", sa.Text(), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "buildings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("complex_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("floors", sa.Integer(), nullable=True),
        sa.Column("apartments", sa.Integer(), nullable=True),
        sa.Column("entrances", sa.Integer(), nullable=True),
        sa.Column("security_number_enc", sa.Text(), nullable=True),
        sa.Column("guest_scud_pass_limit", sa.Integer(), nullable=True),
        sa.Column("meters_mode", sa.Text(), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["complex_id"], ["complexes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "parking_snapshots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("building_id", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("free", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("occupied", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("public", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("private", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("unassigned", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("snapped_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_parking_building_time",
        "parking_snapshots",
        ["building_id", sa.text("snapped_at DESC")],
    )

    op.create_table(
        "storage_snapshots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("building_id", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("free", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("occupied", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("public", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("private", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("unassigned", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("snapped_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_storage_building_time",
        "storage_snapshots",
        ["building_id", sa.text("snapped_at DESC")],
    )

    op.create_table(
        "news",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("priority", sa.Text(), server_default=sa.text("'normal'"), nullable=False),
        sa.Column(
            "buildings",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_news_date", "news", [sa.text("date DESC")])
    op.create_index(
        "idx_news_expires",
        "news",
        ["expires_at"],
        postgresql_where=sa.text("expires_at IS NOT NULL"),
    )
    op.create_index(
        "idx_news_buildings",
        "news",
        ["buildings"],
        postgresql_using="gin",
    )

    op.create_table(
        "weather_cache",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("data_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source", sa.Text(), server_default=sa.text("'openweathermap'"), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_weather_type_time",
        "weather_cache",
        ["type", sa.text("synced_at DESC")],
    )

    op.create_table(
        "screens",
        sa.Column("tablo_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("group_name", sa.Text(), nullable=True),
        sa.Column("ujin_token_enc", sa.Text(), nullable=True),
        sa.Column("is_online", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("tablo_id"),
    )
    op.create_index(
        "idx_screens_online",
        "screens",
        ["is_online", sa.text("last_seen_at DESC")],
    )

    op.create_table(
        "templates",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("config_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("preview_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "screen_templates",
        sa.Column("tablo_id", sa.Text(), nullable=False),
        sa.Column("template_id", sa.BigInteger(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tablo_id"], ["screens.tablo_id"]),
        sa.ForeignKeyConstraint(["template_id"], ["templates.id"]),
        sa.PrimaryKeyConstraint("tablo_id"),
    )

    op.create_table(
        "static_content",
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("value_enc", sa.Text(), nullable=True),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )

    op.create_table(
        "emergency_log",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("tablo_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("emergency_text", sa.Text(), nullable=False),
        sa.Column("priority", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("activated_by", sa.Text(), server_default=sa.text("'uk_panel'"), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_emergency_active",
        "emergency_log",
        [sa.text("activated_at DESC")],
        postgresql_where=sa.text("deactivated_at IS NULL"),
    )
    op.create_index(
        "idx_emergency_tablo_ids",
        "emergency_log",
        ["tablo_ids"],
        postgresql_using="gin",
    )

    op.create_table(
        "sync_log",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.execute(
        """
        INSERT INTO static_content (key, title, value) VALUES
            ('rules',              'Правила ЖК',                'Соблюдайте тишину с 23:00 до 07:00. Запрещено курение в подъездах.'),
            ('trash_schedule',     'График вывоза мусора',      'Вывоз мусора: ежедневно с 07:00 до 09:00.'),
            ('emergency_contacts', 'Контакты аварийной службы', 'Аварийная служба: 112. Диспетчер УК: +7 (495) 000-00-00.')
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("sync_log")
    op.drop_index("idx_emergency_tablo_ids", table_name="emergency_log")
    op.drop_index("idx_emergency_active", table_name="emergency_log")
    op.drop_table("emergency_log")
    op.drop_table("static_content")
    op.drop_table("screen_templates")
    op.drop_table("templates")
    op.drop_index("idx_screens_online", table_name="screens")
    op.drop_table("screens")
    op.drop_index("idx_weather_type_time", table_name="weather_cache")
    op.drop_table("weather_cache")
    op.drop_index("idx_news_buildings", table_name="news")
    op.drop_index("idx_news_expires", table_name="news")
    op.drop_index("idx_news_date", table_name="news")
    op.drop_table("news")
    op.drop_index("idx_storage_building_time", table_name="storage_snapshots")
    op.drop_table("storage_snapshots")
    op.drop_index("idx_parking_building_time", table_name="parking_snapshots")
    op.drop_table("parking_snapshots")
    op.drop_table("buildings")
    op.drop_table("complexes")
