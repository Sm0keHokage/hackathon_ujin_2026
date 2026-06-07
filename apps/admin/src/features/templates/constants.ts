import type { DashboardTemplateConfig } from "../../api";

export const DEFAULT_TEMPLATE_CONFIG: DashboardTemplateConfig = {
    id: "new-template",
    title: "Новый шаблон",
    address: "Адрес ЖК",
    updatedAt: new Date().toISOString(),
    grid: {
        columns: 9,
        rows: 16,
        gap: 16,
    },
    tiles: [
        {
            id: "clock-1",
            type: "clock",
            title: "Сегодня",
            timezone: "Europe/Moscow",
            layout: {
                topLeft: { x: 1, y: 1 },
                bottomRight: { x: 9, y: 3 },
            },
        },
    ],
};
