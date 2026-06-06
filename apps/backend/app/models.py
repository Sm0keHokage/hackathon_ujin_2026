from datetime import datetime
from pydantic import BaseModel, Field


class Metric(BaseModel):
    label: str
    value: int
    total: int | None = None
    status: str = "neutral"


class ResourceSummary(BaseModel):
    total: int = 0
    free: int = 0
    occupied: int = 0
    public: int = 0
    private: int = 0
    unassigned: int = 0


class BuildingSummary(BaseModel):
    id: int
    complex_id: int = 0
    title: str
    address: str | None = None
    floors: int | None = None
    apartments: int | None = None
    entrances: int | None = None
    security_number: str | None = None
    guest_scud_pass_limit: int | None = None
    meters_mode: str | None = None
    meter_push_day: int | None = None
    parking: ResourceSummary = Field(default_factory=ResourceSummary)
    storage: ResourceSummary = Field(default_factory=ResourceSummary)


class NewsSummary(BaseModel):
    id: int
    title: str
    date: str | None = None
    text: str | None = None
    buildings: list[str] = Field(default_factory=list)
    priority: str = "normal"


class LobbyOverview(BaseModel):
    complexes_count: int
    buildings: list[BuildingSummary]
    news: list[NewsSummary]
    metrics: list[Metric]


class EmergencyState(BaseModel):
    active: bool = False
    title: str = "Emergency mode"
    message: str = ""
    tablo_ids: list[str] = Field(default_factory=list)
    affected_buildings: list[int] = Field(default_factory=list)
    priority: int = 1
    log_id: int | None = None
    auto_reset_at: datetime | None = None


class EmergencyUpdate(BaseModel):
    title: str = "Внимание жильцам"
    message: str
    tablo_ids: list[str] = Field(default_factory=list)
    affected_buildings: list[int] = Field(default_factory=list)
    priority: int = 1


class ScreenInfo(BaseModel):
    tablo_id: str
    name: str
    group_name: str | None = None
    is_online: bool = False
    last_seen_at: str | None = None


class SyncStatus(BaseModel):
    source: str
    status: str
    duration_ms: int | None = None
    error: str | None = None
    synced_at: str | None = None


class WsMessage(BaseModel):
    type: str
    data: dict | None = None