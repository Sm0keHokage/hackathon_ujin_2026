import { useEffect, useState } from "react";
import { DashboardScreen } from "@ujin-hack/shared";
import type { DashboardConfig } from "@ujin-hack/shared";

import {
    connectDashboardWebSocket,
    createDashboardSession,
    getDashboardConfig,
} from "./api/dashboard";

export default function App() {
    const [dashboardSession] = useState(() => createDashboardSession());
    const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);

    useEffect(() => {
        let mounted = true;
        let hasWebSocketDashboard = false;

        getDashboardConfig(dashboardSession).then((config) => {
            if (mounted && !hasWebSocketDashboard) {
                setDashboardConfig(config);
            }
        });

        const connection = connectDashboardWebSocket(dashboardSession, {
            onDashboard: (config) => {
                hasWebSocketDashboard = true;

                if (mounted) {
                    setDashboardConfig(config);
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
        });

        return () => {
            mounted = false;
            connection.close();
        };
    }, [dashboardSession]);

    if (!dashboardConfig) {
        return (
            <main className="dashboard-shell dashboard-shell_loading">
                <div className="dashboard-loader">Загрузка данных</div>
            </main>
        );
    }

    return <DashboardScreen config={dashboardConfig} />;
}