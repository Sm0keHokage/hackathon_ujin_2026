import datetime
from typing import Any
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from app.db.column_annotations import (
    bigint_pk,
    bool_nn,
    int_null,
    int_pk,
    text_nn,
    text_null,
    text_pk,
    tz_nn,
    tz_null,
)


class Base(AsyncAttrs, DeclarativeBase):
    pass


class Complex(Base):
    __tablename__ = "complexes"
    id: Mapped[int_pk]
    title: Mapped[text_nn]
    region: Mapped[text_null]
    synced_at: Mapped[tz_nn]


class Building(Base):
    __tablename__ = "buildings"
    id: Mapped[int_pk]
    complex_id: Mapped[int] = mapped_column(ForeignKey("complexes.id"), nullable=False)
    title: Mapped[text_nn]
    address: Mapped[text_null]
    floors: Mapped[int_null]
    apartments: Mapped[int_null]
    entrances: Mapped[int_null]
    security_number_enc: Mapped[text_null]
    guest_scud_pass_limit: Mapped[int_null]
    meters_mode: Mapped[text_null]
    synced_at: Mapped[tz_nn]


class ParkingSnapshot(Base):
    __tablename__ = "parking_snapshots"
    id: Mapped[bigint_pk]
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    free: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    occupied: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    public: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    private: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    unassigned: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    snapped_at: Mapped[tz_nn]


class StorageSnapshot(Base):
    __tablename__ = "storage_snapshots"
    id: Mapped[bigint_pk]
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    free: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    occupied: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    public: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    private: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    unassigned: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    snapped_at: Mapped[tz_nn]


class News(Base):
    __tablename__ = "news"
    id: Mapped[int_pk]
    title: Mapped[text_nn]
    date: Mapped[datetime.date | None] = mapped_column(Date)
    text: Mapped[text_null]
    priority: Mapped[str] = mapped_column(Text, nullable=False, server_default="normal")
    buildings: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="'[]'")
    synced_at: Mapped[tz_nn]
    expires_at: Mapped[tz_null]


class WeatherCache(Base):
    __tablename__ = "weather_cache"

    id: Mapped[bigint_pk]
    type: Mapped[text_nn]
    data_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="openweathermap")
    synced_at: Mapped[tz_nn]


class Screen(Base):
    __tablename__ = "screens"
    tablo_id: Mapped[text_pk]
    name: Mapped[text_nn]
    group_name: Mapped[text_null]
    ujin_token_enc: Mapped[text_null]
    is_online: Mapped[bool_nn]
    last_seen_at: Mapped[tz_null]
    created_at: Mapped[tz_nn]


class Template(Base):
    __tablename__ = "templates"
    id: Mapped[bigint_pk]
    name: Mapped[text_nn]
    config_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    preview_url: Mapped[text_null]
    created_at: Mapped[tz_nn]
    updated_at: Mapped[tz_nn]


class ScreenTemplate(Base):
    __tablename__ = "screen_templates"
    tablo_id: Mapped[str] = mapped_column(ForeignKey("screens.tablo_id"), primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("templates.id"), nullable=False)
    assigned_at: Mapped[tz_nn]


class StaticContent(Base):
    __tablename__ = "static_content"
    key: Mapped[text_pk]
    title: Mapped[text_nn]
    value_enc: Mapped[text_null]
    value: Mapped[text_null]
    updated_at: Mapped[tz_nn]


class EmergencyLog(Base):
    __tablename__ = "emergency_log"
    id: Mapped[bigint_pk]
    tablo_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    emergency_text: Mapped[text_nn]
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    activated_by: Mapped[str] = mapped_column(Text, nullable=False, server_default="uk_panel")
    activated_at: Mapped[tz_nn]
    deactivated_at: Mapped[tz_null]
    auto_reset_at: Mapped[tz_null]


class SyncLog(Base):
    __tablename__ = "sync_log"
    id: Mapped[bigint_pk]
    source: Mapped[text_nn]
    status: Mapped[text_nn]
    duration_ms: Mapped[int_null]
    error: Mapped[text_null]
    synced_at: Mapped[tz_nn]
