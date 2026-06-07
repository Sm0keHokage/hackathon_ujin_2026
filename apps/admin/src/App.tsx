import { AlertTriangle, LayoutTemplate, Monitor, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentType, SVGProps } from "react";

import { apiBaseUrl } from "./config";
import { ScreensPage } from "./features/screens/ScreensPage";
import { DashboardPreviewRoute } from "./features/templates/DashboardPreview";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { PREVIEW_ROUTE_PATH } from "./features/templates/previewStorage";

type AdminPageId = "screens" | "templates" | "emergency";

interface AdminPage {
    id: AdminPageId;
    title: string;
    description: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const pages: AdminPage[] = [
    {
        id: "screens",
        title: "Экраны",
        description: "Подключенные устройства и их текущие назначения.",
        icon: Monitor,
    },
    {
        id: "templates",
        title: "Шаблоны",
        description: "Создание, редактирование и отправка дашбордов.",
        icon: LayoutTemplate,
    },
    {
        id: "emergency",
        title: "Режим ЧС",
        description: "Отдельное управление сообщениями поверх контента.",
        icon: AlertTriangle,
    },
];

function App() {
    if (window.location.pathname === PREVIEW_ROUTE_PATH) {
        return <DashboardPreviewRoute />;
    }

    return <AdminApp />;
}

function AdminApp() {
    const [activePageId, setActivePageId] = useState<AdminPageId>("screens");

    const activePage = useMemo(
        () => pages.find((page) => page.id === activePageId) ?? pages[0],
        [activePageId],
    );

    return (
        <main className="admin-shell">
            <aside className="admin-sidebar" aria-label="Разделы админки">
                <div className="admin-brand">
                    <Settings aria-hidden="true" />
                    <div>
                        <span className="admin-brand__eyebrow">Панель управления</span>
                        <strong>Дашборды ЖК</strong>
                    </div>
                </div>

                <nav className="admin-navigation">
                    {pages.map((page) => {
                        const Icon = page.icon;
                        const isActive = page.id === activePageId;

                        return (
                            <button
                                className={`admin-navigation__item${
                                    isActive ? " admin-navigation__item_active" : ""
                                }`}
                                key={page.id}
                                onClick={() => setActivePageId(page.id)}
                                type="button"
                            >
                                <Icon aria-hidden="true" />
                                <span>{page.title}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="admin-api-status">
                    <span>API</span>
                    <strong>{apiBaseUrl}</strong>
                </div>
            </aside>

            <section className="admin-workspace">
                <header className="admin-header">
                    <div>
                        <p className="admin-header__eyebrow">Администрирование</p>
                        <h1>{activePage.title}</h1>
                        <p>{activePage.description}</p>
                    </div>
                </header>

                <AdminPageContent pageId={activePage.id} />
            </section>
        </main>
    );
}

interface AdminPageContentProps {
    pageId: AdminPageId;
}

function AdminPageContent({ pageId }: AdminPageContentProps) {
    if (pageId === "templates") {
        return <TemplatesPage />;
    }

    if (pageId === "emergency") {
        return (
            <section className="admin-panel">
                <div className="admin-panel__heading">
                    <h2>Режим ЧС</h2>
                </div>
            </section>
        );
    }

    return (
        <ScreensPage />
    );
}

export default App;