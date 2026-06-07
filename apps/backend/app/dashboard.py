from typing import Annotated, Literal, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


Accent = Literal["info", "success", "warning", "critical"]
ServiceState = Literal["normal", "planned", "attention", "disabled"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class GridPoint(_CamelModel):
    x: int = Field(ge=1)
    y: int = Field(ge=1)


class TileLayout(_CamelModel):
    top_left: GridPoint
    bottom_right: GridPoint

    @model_validator(mode="after")
    def validate_coordinates(self) -> "TileLayout":
        if self.bottom_right.x < self.top_left.x:
            raise ValueError("bottomRight.x cannot be less than topLeft.x")
        if self.bottom_right.y < self.top_left.y:
            raise ValueError("bottomRight.y cannot be less than topLeft.y")
        return self


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
    refresh_interval_seconds: int | None = Field(default=None, ge=1)


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
    id: str | None = None
    title: str | None = None
    address: str | None = None
    updated_at: str | None = None
    grid: DashboardGrid = Field(default_factory=DashboardGrid)
    emergency: DashboardEmergency | None = None
    tiles: list[DashboardTileSlot]

    @model_validator(mode="after")
    def validate_tiles_within_grid(self) -> "DashboardConfig":
        for tile in self.tiles:
            if tile.layout.bottom_right.x > self.grid.columns:
                raise ValueError(
                    f"Tile {tile.id} bottomRight.x ({tile.layout.bottom_right.x}) "
                    f"exceeds grid columns ({self.grid.columns})"
                )
            if tile.layout.bottom_right.y > self.grid.rows:
                raise ValueError(
                    f"Tile {tile.id} bottomRight.y ({tile.layout.bottom_right.y}) "
                    f"exceeds grid rows ({self.grid.rows})"
                )
        return self
