from typing import Annotated, Literal, Union
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


Accent = Literal["info", "success", "warning", "critical"]
ServiceState = Literal["normal", "planned", "attention", "disabled"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class GridPoint(_CamelModel):
    x: int = Field(ge=1)
    y: int = Field(ge=1)


class TileLayout(_CamelModel):
    top_left: GridPoint
    bottom_right: GridPoint


class DashboardGrid(_CamelModel):
    columns: int = Field(ge=1, default=9)
    rows: int = Field(ge=1, default=16)
    gap: int = Field(ge=0, default=16)


class TileContent(_CamelModel):
    id: str
    title: str
    accent: Accent | None = None


class ClockContent(TileContent):
    type: Literal["clock"] = "clock"
    timezone: str = "Europe/Moscow"
    subtitle: str | None = None


class MetricContent(TileContent):
    type: Literal["metric"] = "metric"
    value: str
    unit: str | None = None
    caption: str | None = None
    status: Accent | None = None


class TextContent(TileContent):
    type: Literal["text"] = "text"
    body: str
    footer: str | None = None


class NoticeItem(_CamelModel):
    id: str
    title: str
    text: str | None = None
    date: str | None = None
    severity: Accent | None = None


class NoticeListContent(TileContent):
    type: Literal["noticeList"] = "noticeList"
    items: list[NoticeItem] = Field(default_factory=list)


class ServiceStatusItem(_CamelModel):
    id: str
    label: str
    value: str
    status: ServiceState = "normal"


class ServiceStatusContent(TileContent):
    type: Literal["serviceStatus"] = "serviceStatus"
    items: list[ServiceStatusItem] = Field(default_factory=list)


class IframeContent(TileContent):
    type: Literal["iframe"] = "iframe"
    src: str
    refresh_interval_seconds: int | None = None


DashboardTileContent = Annotated[
    Union[
        ClockContent,
        MetricContent,
        TextContent,
        NoticeListContent,
        ServiceStatusContent,
        IframeContent,
    ],
    Field(discriminator="type"),
]


class RotatingTileGroup(_CamelModel):
    id: str
    layout: TileLayout
    rotation_interval_seconds: int | None = Field(default=None, ge=1)
    tiles: list[DashboardTileContent]


class ClockTile(ClockContent):
    layout: TileLayout


class MetricTile(MetricContent):
    layout: TileLayout


class TextTile(TextContent):
    layout: TileLayout


class NoticeListTile(NoticeListContent):
    layout: TileLayout


class ServiceStatusTile(ServiceStatusContent):
    layout: TileLayout


class IframeTile(IframeContent):
    layout: TileLayout


DashboardTileSlot = Annotated[
    Union[
        ClockTile,
        MetricTile,
        TextTile,
        NoticeListTile,
        ServiceStatusTile,
        IframeTile,
        RotatingTileGroup,
    ],
    Field(union_mode="smart"),
]


class DashboardEmergency(_CamelModel):
    active: bool
    message: str
    force_two_lines: bool | None = None
    auto_reset_at: str | None = None


class DashboardConfig(_CamelModel):
    id: str
    title: str
    address: str
    updated_at: str
    grid: DashboardGrid = Field(default_factory=DashboardGrid)
    emergency: DashboardEmergency | None = None
    tiles: list[DashboardTileSlot]
