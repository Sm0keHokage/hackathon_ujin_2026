import { AlertTriangle, LayoutTemplate, Monitor, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, SVGProps } from "react";

import { apiBaseUrl } from "./config";
import { EmergencyPage } from "./features/emergency/EmergencyPage";
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

const PAGE_IDS: AdminPageId[] = pages.map((page) => page.id);

function readPageFromUrl(): AdminPageId {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return PAGE_IDS.includes(tab as AdminPageId) ? (tab as AdminPageId) : "screens";
}

function AdminApp() {
    const [activePageId, setActivePageId] = useState<AdminPageId>(() => readPageFromUrl());

    const activePage = useMemo(
        () => pages.find((page) => page.id === activePageId) ?? pages[0],
        [activePageId],
    );

    const handleNavigate = useCallback((id: AdminPageId) => {
        setActivePageId(id);
        const url = new URL(window.location.href);
        if (id === "screens") {
            url.searchParams.delete("tab");
        } else {
            url.searchParams.set("tab", id);
        }
        window.history.pushState({}, "", url);
    }, []);

    useEffect(() => {
        const handlePopState = () => setActivePageId(readPageFromUrl());
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

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
                                aria-current={isActive ? "page" : undefined}
                                className={`admin-navigation__item${
                                    isActive ? " admin-navigation__item_active" : ""
                                }`}
                                key={page.id}
                                onClick={() => handleNavigate(page.id)}
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
        return <EmergencyPage />;
    }

    return (
        <ScreensPage />
    );
}

export default App;