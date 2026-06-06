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
    columns: int = Field(ge=1)
    rows: int = Field(ge=1)
    gap: int = Field(ge=0, default=16)


class _TileBase(_CamelModel):
    id: str
    title: str
    layout: TileLayout
    accent: Accent | None = None


class ClockTile(_TileBase):
    type: Literal["clock"] = "clock"
    timezone: str = "Europe/Moscow"
    subtitle: str | None = None


class MetricTile(_TileBase):
    type: Literal["metric"] = "metric"
    value: str
    unit: str | None = None
    caption: str | None = None
    status: Accent | None = None


class TextTile(_TileBase):
    type: Literal["text"] = "text"
    body: str
    footer: str | None = None


class NoticeItem(_CamelModel):
    id: str
    title: str
    text: str | None = None
    date: str | None = None
    severity: Accent | None = None


class NoticeListTile(_TileBase):
    type: Literal["noticeList"] = "noticeList"
    items: list[NoticeItem] = Field(default_factory=list)


class ServiceStatusItem(_CamelModel):
    id: str
    label: str
    value: str
    status: ServiceState = "normal"


class ServiceStatusTile(_TileBase):
    type: Literal["serviceStatus"] = "serviceStatus"
    items: list[ServiceStatusItem] = Field(default_factory=list)


class IframeTile(_TileBase):
    type: Literal["iframe"] = "iframe"
    src: str
    refresh_interval_seconds: int | None = None


DashboardTile = Annotated[
    Union[ClockTile, MetricTile, TextTile, NoticeListTile, ServiceStatusTile, IframeTile],
    Field(discriminator="type"),
]


class DashboardConfig(_CamelModel):
    id: str
    title: str
    address: str
    updated_at: str
    grid: DashboardGrid
    tiles: list[DashboardTile]