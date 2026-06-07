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

export type DashboardTileContent =
    | ClockTile
    | MetricTile
    | NoticeListTile
    | ServiceStatusTile
    | TextTile
    | IframeTile;

export type DashboardTile = DashboardTileContent & {
    layout: DashboardTileLayout;
};

export interface RotatingTileGroup {
    id: string;
    layout: DashboardTileLayout;
    rotationIntervalSeconds?: number;
    tiles: DashboardTileContent[];
}

export type DashboardTileSlot = DashboardTile | RotatingTileGroup;

export interface DashboardGrid {
    columns: number;
    rows: number;
    gap: number;
}

export interface DashboardTemplateConfig {
    id: string;
    title: string;
    address: string;
    updatedAt: string;
    grid: DashboardGrid;
    tiles: DashboardTileSlot[];
}

export interface ScreenInfo {
    tablo_id: string;
    name: string;
    group_name: string | null;
    is_online: boolean;
    last_seen_at: string | null;
    assigned_template_id?: number | null;
    assigned_template_name?: string | null;
    assigned_at?: string | null;
}

export interface TemplateInfo {
    id: number;
    name: string;
    preview_url: string | null;
    config_json: DashboardTemplateConfig;
    created_at: string | null;
    updated_at: string | null;
}

export interface TemplateCreateRequest {
    name: string;
    config_json: DashboardTemplateConfig;
    preview_url?: string | null;
}

export interface TemplateUpdateRequest {
    name?: string;
    config_json?: DashboardTemplateConfig;
    preview_url?: string | null;
}

export interface TemplateAssignRequest {
    tablo_id: string;
    template_id: number;
}

export type AdminTargetMode = "screens" | "groups" | "all";

export interface AdminTarget {
    mode: AdminTargetMode;
    tablo_ids?: string[];
    group_names?: string[];
}

export interface TemplateAssignTargetRequest {
    template_id: number;
    target: AdminTarget;
}

export interface EmergencyState {
    active: boolean;
    title: string;
    message: string;
    tablo_ids: string[];
    affected_buildings: number[];
    priority: number;
    log_id: number | null;
    auto_reset_at: string | null;
}

export interface EmergencyActivateRequest {
    title?: string;
    message: string;
    target?: AdminTarget;
    tablo_ids?: string[];
    affected_buildings?: number[];
    priority?: number;
}

export interface ApiRequestOptions {
    signal?: AbortSignal;
}