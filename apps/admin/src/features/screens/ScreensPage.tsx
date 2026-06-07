import { Check, Monitor, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { adminApi, isApiError } from "../../api";
import type { ScreenInfo } from "../../api";

const ALL_GROUPS = "__all__";
const WITHOUT_GROUP = "__without_group__";

type ScreensSource = "api" | "mock";
type ScreensStatus = "idle" | "loading" | "ready";

async function loadMockScreens(): Promise<ScreenInfo[]> {
    if (!import.meta.env.DEV) return [];
    const module = await import("./mockScreens");
    return module.mockScreens;
}

interface ScreensState {
    items: ScreenInfo[];
    source: ScreensSource;
    status: ScreensStatus;
    error: string | null;
}

export function ScreensPage() {
    const [screensState, setScreensState] = useState<ScreensState>({
        items: [],
        source: "api",
        status: "idle",
        error: null,
    });
    const [groupFilter, setGroupFilter] = useState(ALL_GROUPS);
    const [query, setQuery] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const loadScreens = async (signal?: AbortSignal) => {
        setScreensState((current) => ({
            ...current,
            status: "loading",
            error: null,
        }));

        try {
            const screens = await adminApi.getScreens({ signal });
            setScreensState({
                items: screens,
                source: "api",
                status: "ready",
                error: null,
            });
        } catch (error) {
            if (signal?.aborted) {
                return;
            }

            const fallback = await loadMockScreens();
            setScreensState({
                items: fallback,
                source: fallback.length > 0 ? "mock" : "api",
                status: "ready",
                error: resolveLoadError(error),
            });
        }
    };

    useEffect(() => {
        const controller = new AbortController();

        void loadScreens(controller.signal);

        return () => controller.abort();
    }, []);

    const groupOptions = useMemo(() => {
        const groups = new Set<string>();
        let hasScreensWithoutGroup = false;

        screensState.items.forEach((screen) => {
            if (screen.group_name) {
                groups.add(screen.group_name);
            } else {
                hasScreensWithoutGroup = true;
            }
        });

        return [
            { value: ALL_GROUPS, label: "Все группы" },
            ...Array.from(groups)
                .sort((left, right) => left.localeCompare(right, "ru"))
                .map((group) => ({ value: group, label: group })),
            ...(hasScreensWithoutGroup
                ? [{ value: WITHOUT_GROUP, label: "Без группы" }]
                : []),
        ];
    }, [screensState.items]);

    const filteredScreens = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return screensState.items.filter((screen) => {
            const matchesGroup =
                groupFilter === ALL_GROUPS ||
                (groupFilter === WITHOUT_GROUP
                    ? !screen.group_name
                    : screen.group_name === groupFilter);

            if (!matchesGroup) {
                return false;
            }

            if (!normalizedQuery) {
                return true;
            }

            return [screen.name, screen.tablo_id, screen.assigned_template_name ?? ""]
                .join(" ")
                .toLowerCase()
                .includes(normalizedQuery);
        });
    }, [groupFilter, query, screensState.items]);

    const visibleIds = useMemo(
        () => filteredScreens.map((screen) => screen.tablo_id),
        [filteredScreens],
    );

    const selectedVisibleCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
    const allVisibleSelected =
        visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    const onlineCount = screensState.items.filter((screen) => screen.is_online).length;

    const toggleScreen = (tabloId: string) => {
        setSelectedIds((current) =>
            current.includes(tabloId)
                ? current.filter((id) => id !== tabloId)
                : [...current, tabloId],
        );
    };

    const toggleVisibleScreens = () => {
        setSelectedIds((current) => {
            if (allVisibleSelected) {
                return current.filter((id) => !visibleIds.includes(id));
            }

            return Array.from(new Set([...current, ...visibleIds]));
        });
    };

    return (
        <section className="admin-panel admin-panel_full">
            <div className="screens-toolbar">
                <div className="admin-panel__heading">
                    <h2>Экраны</h2>
                    <p>
                        {screensState.items.length} всего, {onlineCount} онлайн,{" "}
                        {selectedIds.length} выбрано
                    </p>
                </div>

                <button
                    className="admin-button admin-button_secondary"
                    disabled={screensState.status === "loading"}
                    onClick={() => void loadScreens()}
                    type="button"
                >
                    <RefreshCw aria-hidden="true" />
                    Обновить
                </button>
            </div>

            {screensState.source === "mock" && (
                <div className="admin-alert" role="status">
                    <strong>Демо-данные.</strong>
                    <span>{screensState.error}</span>
                </div>
            )}

            <div className="screens-filters">
                <label className="admin-field">
                    <span>Группа</span>
                    <select
                        onChange={(event) => setGroupFilter(event.target.value)}
                        value={groupFilter}
                    >
                        {groupOptions.map((group) => (
                            <option key={group.value} value={group.value}>
                                {group.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="admin-field admin-field_search">
                    <span>Поиск</span>
                    <div className="admin-search">
                        <Search aria-hidden="true" />
                        <input
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Название, ID или шаблон"
                            type="search"
                            value={query}
                        />
                    </div>
                </label>

                <button
                    className="admin-button admin-button_secondary"
                    disabled={visibleIds.length === 0}
                    onClick={toggleVisibleScreens}
                    type="button"
                >
                    <Check aria-hidden="true" />
                    {allVisibleSelected ? "Снять выбор" : "Выбрать видимые"}
                </button>
            </div>

            <div className="screens-table-wrap">
                <table className="screens-table">
                    <thead>
                        <tr>
                            <th className="screens-table__check">Выбор</th>
                            <th>Экран</th>
                            <th>Группа</th>
                            <th>Статус</th>
                            <th>Шаблон</th>
                            <th>Последняя активность</th>
                        </tr>
                    </thead>
                    <tbody>
                        {screensState.status === "loading" && (
                            <tr>
                                <td colSpan={6}>Загрузка экранов</td>
                            </tr>
                        )}

                        {screensState.status !== "loading" &&
                            filteredScreens.map((screen) => {
                                const isSelected = selectedIds.includes(screen.tablo_id);

                                return (
                                    <tr
                                        className={isSelected ? "screens-table__row_selected" : ""}
                                        key={screen.tablo_id}
                                    >
                                        <td className="screens-table__check">
                                            <input
                                                aria-label={`Выбрать ${screen.name}`}
                                                checked={isSelected}
                                                onChange={() => toggleScreen(screen.tablo_id)}
                                                type="checkbox"
                                            />
                                        </td>
                                        <td>
                                            <div className="screen-name">
                                                <Monitor aria-hidden="true" />
                                                <div>
                                                    <strong>{screen.name}</strong>
                                                    <span>{screen.tablo_id}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{screen.group_name ?? "Без группы"}</td>
                                        <td>
                                            <span
                                                className={`screen-status ${
                                                    screen.is_online
                                                        ? "screen-status_online"
                                                        : "screen-status_offline"
                                                }`}
                                            >
                                                {screen.is_online ? "Онлайн" : "Офлайн"}
                                            </span>
                                        </td>
                                        <td>
                                            {screen.assigned_template_name ? (
                                                <div className="screen-template">
                                                    <strong>{screen.assigned_template_name}</strong>
                                                    {screen.assigned_template_id && (
                                                        <span>#{screen.assigned_template_id}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="screen-muted">Не назначен</span>
                                            )}
                                        </td>
                                        <td>{formatDateTime(screen.last_seen_at)}</td>
                                    </tr>
                                );
                            })}

                        {screensState.status !== "loading" && filteredScreens.length === 0 && (
                            <tr>
                                <td colSpan={6}>Нет экранов по выбранным условиям</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function resolveLoadError(error: unknown) {
    if (isApiError(error)) {
        return error.message;
    }

    if (error instanceof TypeError) {
        return "API экранов пока недоступен";
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "API экранов пока недоступен";
}

function formatDateTime(value: string | null) {
    if (!value) {
        return "Нет данных";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}