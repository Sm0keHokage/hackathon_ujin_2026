import { useEffect, useState } from "react";

import { getDashboardConfig } from "./api/dashboard";
import { DashboardScreen } from "./features/dashboard/DashboardScreen";
import type { DashboardConfig } from "./features/dashboard/types";

export default function App() {
    const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);

    useEffect(() => {
        let mounted = true;

        getDashboardConfig().then((config) => {
            if (mounted) {
                setDashboardConfig(config);
            }
        });

        return () => {
            mounted = false;
        };
    }, []);

    if (!dashboardConfig) {
        return (
            <main className="dashboard-shell dashboard-shell_loading">
                <div className="dashboard-loader">Загрузка данных</div>
            </main>
        );
    }

    return <DashboardScreen config={dashboardConfig} />;
}