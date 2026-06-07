import { ExternalLink, X } from "lucide-react";
import { useMemo } from "react";
import { DashboardScreen } from "@ujin-hack/shared";
import type { DashboardConfig } from "@ujin-hack/shared";

import type { DashboardTemplateConfig } from "../../api";
import { readPreviewPayload } from "./previewStorage";

interface DashboardPreviewFrameProps {
    config: DashboardTemplateConfig;
    title: string;
    variant?: "thumbnail" | "full";
}

export function DashboardPreviewFrame({
    config,
    title,
    variant = "full",
}: DashboardPreviewFrameProps) {
    const dashboardConfig = useMemo(() => toDashboardConfig(config), [config]);

    return (
        <div
            aria-label={`Предпросмотр шаблона ${title}`}
            className={`dashboard-preview-frame dashboard-preview-frame_${variant}`}
        >
            <div className="dashboard-preview-frame__screen">
                <DashboardScreen config={dashboardConfig} />
            </div>
        </div>
    );
}

export function DashboardPreviewRoute() {
    const payload = useMemo(() => readPreviewPayload(), []);

    if (!payload) {
        return (
            <main className="dashboard-preview-page dashboard-preview-page_empty">
                <section className="dashboard-preview-empty">
                    <h1>Предпросмотр недоступен</h1>
                    <p>Шаблон не найден. Вернитесь в админку и откройте предпросмотр заново.</p>
                    <button className="admin-button admin-button_primary" onClick={() => window.close()} type="button">
                        Закрыть окно
                    </button>
                </section>
            </main>
        );
    }

    return (
        <main className="dashboard-preview-page">
            <header className="dashboard-preview-page__header">
                <div>
                    <span>Предпросмотр шаблона</span>
                    <h1>{payload.templateName}</h1>
                </div>
                <div className="dashboard-preview-page__actions">
                    <a className="admin-button admin-button_secondary" href="/" target="_blank">
                        <ExternalLink aria-hidden="true" />
                        Админка
                    </a>
                    <button className="admin-button admin-button_secondary" onClick={() => window.close()} type="button">
                        <X aria-hidden="true" />
                        Закрыть
                    </button>
                </div>
            </header>

            <section className="dashboard-preview-page__stage">
                <DashboardPreviewFrame
                    config={payload.config}
                    title={payload.templateName}
                    variant="full"
                />
            </section>
        </main>
    );
}

function toDashboardConfig(config: DashboardTemplateConfig): DashboardConfig {
    return {
        ...config,
        grid: {
            columns: 9,
            rows: 16,
            gap: config.grid.gap,
        },
        tiles: config.tiles as DashboardConfig["tiles"],
    };
}
