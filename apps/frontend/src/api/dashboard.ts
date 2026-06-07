import type { DashboardConfig, DashboardEmergency } from "@ujin-hack/shared";

const DASHBOARD_SESSION_STORAGE_KEY = "ujin-dashboard-tablo-id";
const REQUEST_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const SERVER_SILENCE_TIMEOUT_MS = 60_000;
const RECONNECT_INITIAL_DELAY_MS = 3_000;
const RECONNECT_MAX_DELAY_MS = 60_000;
const RECONNECT_JITTER = 0.2;

export interface DashboardSession {
    tabloId: string;
}

export type DashboardConnectionStatus = "connecting" | "open" | "closed" | "fallback";

export interface DashboardWeatherCurrent {
    temp: number;
    feels_like: number;
    description: string;
    icon: string;
    icon_url: string;
    location: string;
    dt: string;
    humidity: number;
    wind_speed: number;
}

export interface DashboardWeatherHourlyItem {
    dt: string;
    hour: string;
    temp: number;
    icon: string;
    icon_url: string;
    description: string;
    pop: number;
}

export interface DashboardWeatherDailyItem {
    date: string;
    day_name: string;
    temp_min: number;
    temp_max: number;
    icon: string;
    icon_url: string;
    description: string;
    pop_max: number;
}

export interface DashboardWeather {
    current?: DashboardWeatherCurrent;
    hourly?: { items: DashboardWeatherHourlyItem[] };
    daily?: { items: DashboardWeatherDailyItem[] };
}

export interface DashboardWebSocketHandlers {
    onDashboard: (config: DashboardConfig) => void;
    onEmergency: (emergency: DashboardEmergency) => void;
    onOverview?: (data: unknown) => void;
    onWeather?: (weather: DashboardWeather) => void;
    onStatusChange?: (status: DashboardConnectionStatus) => void;
}

export interface DashboardConnection {
    close: () => void;
}

interface DashboardWebSocketMessage {
    type?: string;
    data?: unknown;
}

export function createDashboardSession(): DashboardSession {
    return {
        tabloId: resolveTabloId(),
    };
}

export async function getDashboardConfig(session: DashboardSession): Promise<DashboardConfig> {
    return fetchDashboardConfig(session);
}

export function connectDashboardWebSocket(
    session: DashboardSession,
    handlers: DashboardWebSocketHandlers,
): DashboardConnection {
    let reconnectTimeoutId: number | undefined;
    let heartbeatIntervalId: number | undefined;
    let silenceCheckIntervalId: number | undefined;
    let socket: WebSocket | null = null;
    let closedByClient = false;
    let reconnectAttempt = 0;
    let lastServerMessageAt = 0;

    const stopHeartbeat = () => {
        if (heartbeatIntervalId !== undefined) {
            window.clearInterval(heartbeatIntervalId);
            heartbeatIntervalId = undefined;
        }
    };

    const stopSilenceCheck = () => {
        if (silenceCheckIntervalId !== undefined) {
            window.clearInterval(silenceCheckIntervalId);
            silenceCheckIntervalId = undefined;
        }
    };

    const startHeartbeat = () => {
        stopHeartbeat();

        heartbeatIntervalId = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
                try {
                    socket.send("ping");
                } catch {
                    socket.close();
                }
            }
        }, HEARTBEAT_INTERVAL_MS);
    };

    const startSilenceCheck = () => {
        stopSilenceCheck();

        silenceCheckIntervalId = window.setInterval(() => {
            if (socket?.readyState !== WebSocket.OPEN) return;
            if (Date.now() - lastServerMessageAt > SERVER_SILENCE_TIMEOUT_MS) {
                console.warn("Dashboard WS silent too long, forcing reconnect");
                socket.close(4000, "silence-timeout");
            }
        }, 10_000);
    };

    const scheduleReconnect = () => {
        const base = Math.min(
            RECONNECT_INITIAL_DELAY_MS * 2 ** reconnectAttempt,
            RECONNECT_MAX_DELAY_MS,
        );
        const jitterRange = base * RECONNECT_JITTER;
        const delay = base + (Math.random() * 2 - 1) * jitterRange;
        reconnectAttempt += 1;
        reconnectTimeoutId = window.setTimeout(connect, Math.max(500, delay));
    };

    const connect = () => {
        handlers.onStatusChange?.("connecting");

        try {
            socket = new WebSocket(getDashboardWebSocketUrl(session));
        } catch (error) {
            console.warn("Dashboard WS construction failed", error);
            handlers.onStatusChange?.("fallback");
            scheduleReconnect();
            return;
        }

        socket.addEventListener("open", () => {
            reconnectAttempt = 0;
            lastServerMessageAt = Date.now();
            startHeartbeat();
            startSilenceCheck();
            handlers.onStatusChange?.("open");
        });

        socket.addEventListener("message", (event) => {
            lastServerMessageAt = Date.now();
            handleDashboardSocketMessage(event.data, handlers);
        });

        socket.addEventListener("close", () => {
            stopHeartbeat();
            stopSilenceCheck();
            socket = null;

            if (closedByClient) {
                handlers.onStatusChange?.("closed");
                return;
            }

            handlers.onStatusChange?.("fallback");
            scheduleReconnect();
        });

        socket.addEventListener("error", () => {
            handlers.onStatusChange?.("fallback");
        });
    };

    connect();

    return {
        close: () => {
            closedByClient = true;

            if (reconnectTimeoutId !== undefined) {
                window.clearTimeout(reconnectTimeoutId);
            }

            stopHeartbeat();
            stopSilenceCheck();
            socket?.close();
            socket = null;
        },
    };
}

function getApiBaseUrl() {
    return import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") || "";
}

function getDashboardUrl(session: DashboardSession) {
    const params = new URLSearchParams({ tablo_id: session.tabloId });
    return `${getApiBaseUrl()}/api/dashboard/config?${params.toString()}`;
}

function getDashboardWebSocketUrl(session: DashboardSession) {
    const params = new URLSearchParams({ tablo_id: session.tabloId });
    return `${getWebSocketBaseUrl()}/ws/lobby?${params.toString()}`;
}

function getWebSocketBaseUrl() {
    const configuredWsBaseUrl = import.meta.env.VITE_WS_BASE_URL?.trim().replace(/\/+$/, "");

    if (configuredWsBaseUrl) {
        return configuredWsBaseUrl;
    }

    const apiBaseUrl = getApiBaseUrl();

    if (!apiBaseUrl) {
        return `${getWebSocketProtocol()}//${window.location.host}`;
    }

    const url = new URL(apiBaseUrl, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

    return url.toString().replace(/\/+$/, "");
}

async function fetchDashboardConfig(session: DashboardSession): Promise<DashboardConfig> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(getDashboardUrl(session), {
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Dashboard config request failed: ${response.status}`);
        }

        return await response.json() as DashboardConfig;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function handleDashboardSocketMessage(
    rawMessage: unknown,
    handlers: DashboardWebSocketHandlers,
) {
    const message = parseDashboardSocketMessage(rawMessage);

    if (!message) {
        return;
    }

    switch (message.type) {
        case "dashboard":
            handlers.onDashboard(message.data as DashboardConfig);
            return;
        case "emergency":
            handlers.onEmergency(normalizeEmergencyState(message.data));
            return;
        case "overview":
            handlers.onOverview?.(message.data);
            return;
        case "weather":
            if (isRecord(message.data)) {
                handlers.onWeather?.(message.data as DashboardWeather);
            }
            return;
        case "pong":
            return;
    }
}

function parseDashboardSocketMessage(rawMessage: unknown): DashboardWebSocketMessage | null {
    if (typeof rawMessage !== "string") {
        return null;
    }

    try {
        const parsed = JSON.parse(rawMessage) as DashboardWebSocketMessage;
        return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch (error) {
        console.warn("Could not parse dashboard websocket message.", error);
        return null;
    }
}

function normalizeEmergencyState(value: unknown): DashboardEmergency {
    if (!isRecord(value)) {
        return {
            active: false,
            message: "",
        };
    }

    return {
        active: Boolean(value.active),
        message: typeof value.message === "string" ? value.message : "",
        autoResetAt: typeof value.auto_reset_at === "string"
            ? value.auto_reset_at
            : typeof value.autoResetAt === "string"
                ? value.autoResetAt
                : undefined,
    };
}

function resolveTabloId() {
    const urlTabloId = getUrlTabloId();

    if (urlTabloId) {
        rememberTabloId(urlTabloId);
        return urlTabloId;
    }

    const envTabloId = import.meta.env.VITE_TABLO_ID?.trim();

    if (envTabloId) {
        return envTabloId;
    }

    const persisted = readPersistedTabloId();
    if (persisted) {
        return persisted;
    }

    const nextTabloId = createSessionTabloId();
    rememberTabloId(nextTabloId);
    return nextTabloId;
}

function readPersistedTabloId(): string | null {
    try {
        const fromLocal = window.localStorage.getItem(DASHBOARD_SESSION_STORAGE_KEY);
        if (fromLocal) return fromLocal;
    } catch (_localStorageError) {
        void _localStorageError;
    }
    try {
        return window.sessionStorage.getItem(DASHBOARD_SESSION_STORAGE_KEY);
    } catch {
        return null;
    }
}

function rememberTabloId(id: string) {
    try {
        window.localStorage.setItem(DASHBOARD_SESSION_STORAGE_KEY, id);
    } catch {
        try {
            window.sessionStorage.setItem(DASHBOARD_SESSION_STORAGE_KEY, id);
        } catch (storageError) {
            void storageError;
        }
    }
}

function getUrlTabloId() {
    const params = new URLSearchParams(window.location.search);
    return (
        params.get("tablo_id")?.trim()
        || params.get("tabloId")?.trim()
        || params.get("screen_id")?.trim()
        || params.get("screenId")?.trim()
        || ""
    );
}

function createSessionTabloId() {
    if ("randomUUID" in crypto) {
        return `display-${crypto.randomUUID()}`;
    }

    return `display-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getWebSocketProtocol() {
    return window.location.protocol === "https:" ? "wss:" : "ws:";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}