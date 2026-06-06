import demoDashboardConfig from "../features/dashboard/mockDashboard.json";
import type { DashboardConfig } from "../features/dashboard/types";

const DEFAULT_TABLO_ID = "display";
const REQUEST_TIMEOUT_MS = 5_000;

function getApiBaseUrl() {
    return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "";
}

function getDashboardUrl() {
    const params = new URLSearchParams({ tablo_id: DEFAULT_TABLO_ID });
    return `${getApiBaseUrl()}/api/dashboard/config?${params.toString()}`;
}

async function fetchDashboardConfig(): Promise<DashboardConfig> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(getDashboardUrl(), {
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

export async function getDashboardConfig(): Promise<DashboardConfig> {
    try {
        return await fetchDashboardConfig();
    } catch (error) {
        console.warn("Dashboard API is unavailable, using demo config.", error);
        return demoDashboardConfig as DashboardConfig;
    }
}