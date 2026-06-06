import {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode
} from "react";

import {
    AlertTriangle,
    Bell,
    CalendarDays,
    CircleCheck,
    Clock3,
    CloudSun,
    Gauge,
    MapPinned,
    PhoneCall,
    Wrench,
} from "lucide-react";

import type {
    ClockTile,
    DashboardConfig,
    DashboardGrid,
    DashboardSeverity,
    DashboardStatus,
    DashboardTileContent,
    DashboardTileLayout,
    DashboardTileSlot,
    IframeTile,
    MetricTile,
    NoticeListTile,
    RotatingTileGroup,
    ServiceStatusTile,
    TextTile,
} from "./types";

interface DashboardScreenProps {
    config: DashboardConfig;
}

interface ElementSize {
    width: number;
    height: number;
}

interface GridMetrics {
    chunkSize: number;
    width: number;
    height: number;
}

const DASHBOARD_GRID_COLUMNS = 9;
const DASHBOARD_GRID_ROWS = 16;
const DEFAULT_ROTATION_INTERVAL_SECONDS = 30;

const severityLabels: Record<DashboardSeverity, string> = {
    info: "Информация",
    success: "Норма",
    warning: "Внимание",
    critical: "Срочно",
};

function getTileGridPosition(layout: DashboardTileLayout): CSSProperties {
    return {
        gridColumn: `${layout.topLeft.x} / ${layout.bottomRight.x + 1}`,
        gridRow: `${layout.topLeft.y} / ${layout.bottomRight.y + 1}`,
    };
}

function isRotatingTileGroup(slot: DashboardTileSlot): slot is RotatingTileGroup {
    return "tiles" in slot;
}

function getSlotTiles(slot: DashboardTileSlot): DashboardTileContent[] {
    return isRotatingTileGroup(slot) ? slot.tiles : [slot];
}

function normalizeRotationIntervalSeconds(value?: number) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : DEFAULT_ROTATION_INTERVAL_SECONDS;
}

function getSlotRotationIntervalSeconds(slot: DashboardTileSlot) {
    return isRotatingTileGroup(slot)
        ? normalizeRotationIntervalSeconds(slot.rotationIntervalSeconds)
        : DEFAULT_ROTATION_INTERVAL_SECONDS;
}

function useActiveTile(slot: DashboardTileSlot) {
    const tiles = useMemo(() => getSlotTiles(slot), [slot]);
    const rotationIntervalSeconds = getSlotRotationIntervalSeconds(slot);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        setActiveIndex(0);

        if (tiles.length < 2) {
            return;
        }

        const timerId = window.setInterval(() => {
            setActiveIndex((currentIndex) => (currentIndex + 1) % tiles.length);
        }, rotationIntervalSeconds * 1000);

        return () => {
            window.clearInterval(timerId);
        };
    }, [rotationIntervalSeconds, tiles]);

    return tiles[activeIndex % tiles.length] ?? null;
}

function getGridMetrics(grid: DashboardGrid, size: ElementSize): GridMetrics {
    const horizontalGaps = (DASHBOARD_GRID_COLUMNS - 1) * grid.gap;
    const verticalGaps = (DASHBOARD_GRID_ROWS - 1) * grid.gap;
    const availableWidth = Math.max(0, size.width - horizontalGaps);
    const availableHeight = Math.max(0, size.height - verticalGaps);
    const chunkSize = Math.max(0, Math.min(
        availableWidth / DASHBOARD_GRID_COLUMNS,
        availableHeight / DASHBOARD_GRID_ROWS,
    ));

    return {
        chunkSize,
        width: DASHBOARD_GRID_COLUMNS * chunkSize + horizontalGaps,
        height: DASHBOARD_GRID_ROWS * chunkSize + verticalGaps,
    };
}

function useElementSize() {
    const ref = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

    useLayoutEffect(() => {
        const element = ref.current;

        if (!element) {
            return;
        }

        const updateSize = () => {
            const rect = element.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        };

        updateSize();

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];

            if (!entry) {
                return;
            }

            setSize({
                width: entry.contentRect.width,
                height: entry.contentRect.height,
            });
        });

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, []);

    return { ref, size };
}

const statusLabels: Record<DashboardStatus, string> = {
    normal: "Норма",
    planned: "Планово",
    attention: "Внимание",
    disabled: "Отключено",
};

function TileHeader({
    title,
    icon,
    label,
}: {
    title: string;
    icon: ReactNode;
    label?: string;
}) {
    return (
        <div className="dashboard-tile__header">
            <div className="dashboard-tile__title">
                {icon}
                <span>{title}</span>
            </div>
            {label ? <span className="dashboard-tile__label">{label}</span> : null}
        </div>
    );
}

function NoticeListTileContent({ tile }: { tile: NoticeListTile }) {
    return (
        <>
            <TileHeader title={tile.title} icon={<Bell size={24} aria-hidden="true" />} />
            <div className="notice-list">
                {tile.items.map((item) => (
                    <section className="notice-list__item" key={item.id}>
                        <div className="notice-list__meta">
                            {item.date ? <time dateTime={item.date}>{formatDate(item.date)}</time> : null}
                            {item.severity ? (
                                <span className={`status-pill status-pill_${item.severity}`}>
                                    {severityLabels[item.severity]}
                                </span>
                            ) : null}
                        </div>
                        <h2>{item.title}</h2>
                        {item.text ? <p>{item.text}</p> : null}
                    </section>
                ))}
            </div>
        </>
    );
}

function ServiceStatusTileContent({ tile }: { tile: ServiceStatusTile }) {
    return (
        <>
            <TileHeader title={tile.title} icon={<Wrench size={24} aria-hidden="true" />} />
            <div className="service-list">
                {tile.items.map((item) => (
                    <div className="service-list__item" key={item.id}>
                        <div>
                            <p>{item.label}</p>
                            <span>{item.value}</span>
                        </div>
                        <span className={`service-list__status service-list__status_${item.status}`}>
                            {statusLabels[item.status]}
                        </span>
                    </div>
                ))}
            </div>
        </>
    );
}

function TextTileContent({ tile }: { tile: TextTile }) {
    return (
        <>
            <TileHeader title={tile.title} icon={<PhoneCall size={24} aria-hidden="true" />} />
            <div className="text-tile__body">{tile.body}</div>
            {tile.footer ? <div className="text-tile__footer">{tile.footer}</div> : null}
        </>
    );
}

function IframeTileContent({ tile }: { tile: IframeTile }) {
    return (
        <>
            <TileHeader title={tile.title} icon={<MapPinned size={24} aria-hidden="true" />} />
            <div className="iframe-tile__frame">
                <iframe title={tile.title} src={tile.src} loading="lazy" referrerPolicy="no-referrer" />
            </div>
        </>
    );
}

function MetricIcon({ tile }: { tile: MetricTile }) {
    if (tile.title.toLowerCase().includes("улице")) {
        return <CloudSun size={24} aria-hidden="true" />;
    }

    if (tile.status === "warning" || tile.status === "critical") {
        return <AlertTriangle size={24} aria-hidden="true" />;
    }

    if (tile.status === "success") {
        return <CircleCheck size={24} aria-hidden="true" />;
    }

    return <Gauge size={24} aria-hidden="true" />;
}

function useCurrentDate() {
    const [date, setDate] = useState(() => new Date());

    useEffect(() => {
        const timerId = window.setInterval(() => {
            setDate(new Date());
        }, 30_000);

        return () => {
            window.clearInterval(timerId);
        };
    }, []);

    return date;
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
    }).format(new Date(value));
}

function formatUpdatedAt(value: string) {
    return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function MetricTileContent({ tile }: { tile: MetricTile }) {
    return (
        <>
            <TileHeader
                title={tile.title}
                icon={<MetricIcon tile={tile} />}
                label={tile.status ? severityLabels[tile.status] : undefined}
            />
            <div className="metric-tile__value">
                <span>{tile.value}</span>
                {tile.unit ? <small>{tile.unit}</small> : null}
            </div>
            {tile.caption ? <p className="metric-tile__caption">{tile.caption}</p> : null}
        </>
    );
}

function ClockTileContent({ tile }: { tile: ClockTile }) {
    const currentDate = useCurrentDate();
    const time = new Intl.DateTimeFormat("ru-RU", {
        timeZone: tile.timezone,
        hour: "2-digit",
        minute: "2-digit",
    }).format(currentDate);
    const date = new Intl.DateTimeFormat("ru-RU", {
        timeZone: tile.timezone,
        day: "numeric",
        month: "long",
        weekday: "long",
    }).format(currentDate);

    return (
        <>
            <TileHeader title={tile.title} icon={<Clock3 size={24} aria-hidden="true" />} />
            <div className="clock-tile__time">{time}</div>
            <div className="clock-tile__date">{date}</div>
            {tile.subtitle ? <div className="clock-tile__subtitle">{tile.subtitle}</div> : null}
        </>
    );
}

function renderTile(tile: DashboardTileContent) {
    switch (tile.type) {
        case "clock":
            return <ClockTileContent tile={tile} />;
        case "metric":
            return <MetricTileContent tile={tile} />;
        case "noticeList":
            return <NoticeListTileContent tile={tile} />;
        case "serviceStatus":
            return <ServiceStatusTileContent tile={tile} />;
        case "text":
            return <TextTileContent tile={tile} />;
        case "iframe":
            return <IframeTileContent tile={tile} />;
    }
}

function DashboardTileCard({ slot }: { slot: DashboardTileSlot }) {
    const activeTile = useActiveTile(slot);

    if (!activeTile) {
        return null;
    }

    return (
        <article
            className={`dashboard-tile dashboard-tile_${activeTile.type} ${activeTile.accent ? `dashboard-tile_${activeTile.accent}` : ""}`}
            style={getTileGridPosition(slot.layout)}
        >
            {renderTile(activeTile)}
        </article>
    );
}

export function DashboardScreen({ config }: DashboardScreenProps) {
    const gridArea = useElementSize();
    const gridMetrics = useMemo(
        () => getGridMetrics(config.grid, gridArea.size),
        [config.grid, gridArea.size],
    );
    const gridStyle = useMemo<CSSProperties>(
        () => ({
            width: gridMetrics.width,
            height: gridMetrics.height,
            gridTemplateColumns: `repeat(${DASHBOARD_GRID_COLUMNS}, ${gridMetrics.chunkSize}px)`,
            gridTemplateRows: `repeat(${DASHBOARD_GRID_ROWS}, ${gridMetrics.chunkSize}px)`,
            gap: config.grid.gap,
        }),
        [config.grid, gridMetrics],
    );

    return (
        <main className="dashboard-shell">
            <section className="dashboard-stage" aria-label={config.title}>
                <header className="dashboard-header">
                    <div>
                        <p className="dashboard-kicker">{config.address}</p>
                        <h1>{config.title}</h1>
                    </div>
                    <div className="dashboard-updated">
                        <CalendarDays size={22} aria-hidden="true" />
                        <span>{formatUpdatedAt(config.updatedAt)}</span>
                    </div>
                </header>

                <div className="dashboard-grid-area" ref={gridArea.ref}>
                    <div className="dashboard-grid" style={gridStyle}>
                        {config.tiles.map((slot) => (
                            <DashboardTileCard key={slot.id} slot={slot} />
                        ))}
                    </div>
                </div>
            </section>
        </main>
    );
}