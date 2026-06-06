export type DashboardTileType =
    | "clock"
    | "metric"
    | "noticeList"
    | "serviceStatus"
    | "text"
    | "iframe";

export type DashboardSeverity = "info" | "success" | "warning" | "critical";

export type DashboardStatus = "normal" | "planned" | "attention" | "disabled";

export interface DashboardChunkCoordinate {
    x: number;
    y: number;
}

export interface DashboardTileLayout {
    topLeft: DashboardChunkCoordinate;
    bottomRight: DashboardChunkCoordinate;
}

interface DashboardTileBase {
    id: string;
    type: DashboardTileType;
    title: string;
    layout: DashboardTileLayout;
    accent?: DashboardSeverity;
}

export interface ClockTile extends DashboardTileBase {
    type: "clock";
    timezone: string;
    subtitle?: string;
}

export interface MetricTile extends DashboardTileBase {
    type: "metric";
    value: string;
    unit?: string;
    caption?: string;
    status?: DashboardSeverity;
}

export interface NoticeItem {
    id: string;
    title: string;
    text?: string;
    date?: string;
    severity?: DashboardSeverity;
}

export interface NoticeListTile extends DashboardTileBase {
    type: "noticeList";
    items: NoticeItem[];
}

export interface ServiceStatusItem {
    id: string;
    label: string;
    value: string;
    status: DashboardStatus;
}

export interface ServiceStatusTile extends DashboardTileBase {
    type: "serviceStatus";
    items: ServiceStatusItem[];
}

export interface TextTile extends DashboardTileBase {
    type: "text";
    body: string;
    footer?: string;
}

export interface IframeTile extends DashboardTileBase {
    type: "iframe";
    src: string;
    refreshIntervalSeconds?: number;
}

export type DashboardTile =
    | ClockTile
    | MetricTile
    | NoticeListTile
    | ServiceStatusTile
    | TextTile
    | IframeTile;

export interface DashboardGrid {
    columns: number;
    rows: number;
    gap: number;
}

export interface DashboardConfig {
    id: string;
    title: string;
    address: string;
    updatedAt: string;
    grid: DashboardGrid;
    tiles: DashboardTile[];
}