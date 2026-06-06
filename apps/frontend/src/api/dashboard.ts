import demoDashboardConfig from "../features/dashboard/mockDashboard.json";
import type { DashboardConfig } from "../features/dashboard/types";

export async function getDashboardConfig(): Promise<DashboardConfig> {
    return demoDashboardConfig as DashboardConfig;
}