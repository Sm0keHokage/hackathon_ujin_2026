import demoDashboardConfig from "../features/dashboard/mockDashboard.json";
import type { DashboardConfig, DashboardEmergency } from "@ujin-hack/shared";

const DASHBOARD_SESSION_STORAGE_KEY = "ujin-dashboard-tablo-id";
const REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_RECONNECT_DELAY_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 25_000;

export interface DashboardSession {
    tabloId: string;
}

export type DashboardConnectionStatus = "connecting" | "open" | "closed" | "fallback";

export interface DashboardWebSocketHandlers {
    onDashboard: (config: DashboardConfig) => void;
    onEmergency: (emergency: DashboardEmergency) => void;
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
    try {
        return await fetchDashboardConfig(session);
    } catch (error) {
        console.warn("Dashboard API is unavailable, using demo config.", error);
        return demoDashboardConfig as DashboardConfig;
    }
}

export function connectDashboardWebSocket(
    session: DashboardSession,
    handlers: DashboardWebSocketHandlers,
): DashboardConnection {
    let reconnectTimeoutId: number | undefined;
    let heartbeatIntervalId: number | undefined;
    let socket: WebSocket | null = null;
    let closedByClient = false;

    const stopHeartbeat = () => {
        if (heartbeatIntervalId !== undefined) {
            window.clearInterval(heartbeatIntervalId);
            heartbeatIntervalId = undefined;
        }
    };

    const startHeartbeat = () => {
        stopHeartbeat();

        heartbeatIntervalId = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
                socket.send("ping");
            }
        }, HEARTBEAT_INTERVAL_MS);
    };

    const connect = () => {
        handlers.onStatusChange?.("connecting");

        socket = new WebSocket(getDashboardWebSocketUrl(session));

        socket.addEventListener("open", () => {
            startHeartbeat();
            handlers.onStatusChange?.("open");
        });

        socket.addEventListener("message", (event) => {
            handleDashboardSocketMessage(event.data, handlers);
        });

        socket.addEventListener("close", () => {
            stopHeartbeat();
            socket = null;

            if (closedByClient) {
                handlers.onStatusChange?.("closed");
                return;
            }

            handlers.onStatusChange?.("fallback");
            reconnectTimeoutId = window.setTimeout(connect, DEFAULT_RECONNECT_DELAY_MS);
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

    if (message.type === "dashboard") {
        handlers.onDashboard(message.data as DashboardConfig);
        return;
    }

    if (message.type === "emergency") {
        handlers.onEmergency(normalizeEmergencyState(message.data));
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
        return urlTabloId;
    }

    const envTabloId = import.meta.env.VITE_TABLO_ID?.trim();

    if (envTabloId) {
        return envTabloId;
    }

    const existingSessionTabloId = window.sessionStorage.getItem(DASHBOARD_SESSION_STORAGE_KEY);

    if (existingSessionTabloId) {
        return existingSessionTabloId;
    }

    const nextTabloId = createSessionTabloId();
    window.sessionStorage.setItem(DASHBOARD_SESSION_STORAGE_KEY, nextTabloId);

    return nextTabloId;
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