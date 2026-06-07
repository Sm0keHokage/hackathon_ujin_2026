import { useEffect, useState } from "react";
import { DashboardScreen } from "@ujin-hack/shared";
import type { DashboardConfig } from "@ujin-hack/shared";

import {
    connectDashboardWebSocket,
    createDashboardSession,
    getDashboardConfig,
} from "./api/dashboard";
import type { DashboardConnectionStatus, DashboardWeather } from "./api/dashboard";
import { WeatherOverlay } from "./features/weather/WeatherOverlay";

const RECONNECT_BANNER_DELAY_MS = 6_000;

export default function App() {
    const [dashboardSession] = useState(() => createDashboardSession());
    const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);
    const [weather, setWeather] = useState<DashboardWeather | null>(null);
    const [httpFailed, setHttpFailed] = useState(false);
    const [wsStatus, setWsStatus] = useState<DashboardConnectionStatus>("connecting");
    const [showOfflineBanner, setShowOfflineBanner] = useState(false);

    useEffect(() => {
        let mounted = true;
        let hasWebSocketDashboard = false;

        getDashboardConfig(dashboardSession)
            .then((config) => {
                if (mounted && !hasWebSocketDashboard) {
                    setDashboardConfig(config);
                    setHttpFailed(false);
                }
            })
            .catch((error) => {
                console.warn("Dashboard HTTP fetch failed", error);
                if (mounted) {
                    setHttpFailed(true);
                }
            });

        const connection = connectDashboardWebSocket(dashboardSession, {
            onDashboard: (config) => {
                hasWebSocketDashboard = true;

                if (mounted) {
                    setDashboardConfig(config);
                    setHttpFailed(false);
                }
            },
            onEmergency: (emergency) => {
                if (!mounted) {
                    return;
                }

                setDashboardConfig((config) => {
                    if (!config) {
                        return config;
                    }

                    return {
                        ...config,
                        emergency,
                    };
                });
            },
            onWeather: (data) => {
                if (mounted) {
                    setWeather(data);
                }
            },
            onStatusChange: (status) => {
                if (mounted) {
                    setWsStatus(status);
                }
            },
        });

        return () => {
            mounted = false;
            connection.close();
        };
    }, [dashboardSession]);

    useEffect(() => {
        if (wsStatus === "open" || wsStatus === "closed") {
            setShowOfflineBanner(false);
            return;
        }

        const timerId = window.setTimeout(() => setShowOfflineBanner(true), RECONNECT_BANNER_DELAY_MS);
        return () => window.clearTimeout(timerId);
    }, [wsStatus]);

    if (!dashboardConfig) {
        if (httpFailed && wsStatus !== "open") {
            return (
                <main className="dashboard-shell dashboard-shell_loading">
                    <div className="dashboard-loader">
                        <p>Нет связи с сервером</p>
                        <small>Табло автоматически подключится, когда сервер станет доступен.</small>
                    </div>
                </main>
            );
        }

        return (
            <main className="dashboard-shell dashboard-shell_loading">
                <div className="dashboard-loader">Загрузка данных</div>
            </main>
        );
    }

    return (
        <>
            <DashboardScreen config={dashboardConfig} />
            {weather && <WeatherOverlay weather={weather} />}
            {showOfflineBanner && (
                <div
                    className={`dashboard-connection-badge dashboard-connection-badge_${wsStatus}`}
                    role="status"
                >
                    {wsStatus === "connecting" ? "Подключение..." : "Нет связи с сервером"}
                </div>
            )}
        </>
    );
}
