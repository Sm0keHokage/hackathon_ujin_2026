import { AlertTriangle, Check, Monitor, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { adminApi, isApiError } from "../../api";
import type {
    AdminTarget,
    AdminTargetMode,
    EmergencyState,
    ScreenInfo,
} from "../../api";

type LoadStatus = "idle" | "loading" | "ready";

interface EmergencyData {
    state: EmergencyState | null;
    screens: ScreenInfo[];
}

const DEFAULT_TITLE = "Внимание жильцам";

export function EmergencyPage() {
    const [data, setData] = useState<EmergencyData>({ state: null, screens: [] });
    const [status, setStatus] = useState<LoadStatus>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);

    const [title, setTitle] = useState(DEFAULT_TITLE);
    const [message, setMessage] = useState("");
    const [priority, setPriority] = useState<number>(1);
    const [mode, setMode] = useState<AdminTargetMode>("all");
    const [selectedTabloIds, setSelectedTabloIds] = useState<string[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);

    const loadAll = async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setStatus("loading");
        setLoadError(null);

        try {
            const [state, screens] = await Promise.all([
                adminApi.getEmergencyState({ signal: controller.signal }),
                adminApi.getScreens({ signal: controller.signal }).catch(() => [] as ScreenInfo[]),
            ]);
            if (controller.signal.aborted) return;
            setData({ state, screens });
            setStatus("ready");
        } catch (error) {
            if (controller.signal.aborted) return;
            setStatus("ready");
            setLoadError(resolveError(error, "Не удалось загрузить состояние ЧС"));
        }
    };

    useEffect(() => {
        void loadAll();
        return () => abortRef.current?.abort();
    }, []);

    const groups = useMemo(() => {
        const acc = new Set<string>();
        data.screens.forEach((screen) => {
            if (screen.group_name) acc.add(screen.group_name);
        });
        return Array.from(acc).sort((left, right) => left.localeCompare(right, "ru"));
    }, [data.screens]);

    const activeState = data.state?.active ? data.state : null;

    const handleToggleScreen = (id: string) => {
        setSelectedTabloIds((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        );
    };

    const handleToggleGroup = (name: string) => {
        setSelectedGroups((current) =>
            current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
        );
    };

    const handleActivate = async () => {
        setSubmitError(null);
        setInfo(null);

        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            setSubmitError("Введите текст сообщения");
            return;
        }
        if (mode === "screens" && selectedTabloIds.length === 0) {
            setSubmitError("Выберите хотя бы один экран");
            return;
        }
        if (mode === "groups" && selectedGroups.length === 0) {
            setSubmitError("Выберите хотя бы одну группу");
            return;
        }

        const target: AdminTarget = {
            mode,
            tablo_ids: mode === "screens" ? selectedTabloIds : [],
            group_names: mode === "groups" ? selectedGroups : [],
        };

        setIsSubmitting(true);
        try {
            const next = await adminApi.activateEmergency({
                title: title.trim() || DEFAULT_TITLE,
                message: trimmedMessage,
                priority,
                target,
            });
            setData((current) => ({ ...current, state: next }));
            setInfo("Сообщение отправлено на экраны");
        } catch (error) {
            setSubmitError(resolveError(error, "Не удалось активировать режим ЧС"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeactivate = async () => {
        setSubmitError(null);
        setInfo(null);
        setIsSubmitting(true);
        try {
            const next = await adminApi.deactivateEmergency();
            setData((current) => ({ ...current, state: next }));
            setInfo("Режим ЧС отключён");
        } catch (error) {
            setSubmitError(resolveError(error, "Не удалось отключить режим ЧС"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="admin-panel admin-panel_full">
            <div className="screens-toolbar">
                <div className="admin-panel__heading">
                    <h2>Режим ЧС</h2>
                    <p>Срочные сообщения поверх контента табло.</p>
                </div>

                <button
                    className="admin-button admin-button_secondary"
                    disabled={status === "loading"}
                    onClick={() => void loadAll()}
                    type="button"
                >
                    <RefreshCw aria-hidden="true" />
                    Обновить
                </button>
            </div>

            {loadError && (
                <div className="admin-alert admin-alert_error" role="status">
                    <strong>Ошибка.</strong>
                    <span>{loadError}</span>
                </div>
            )}

            {activeState && (
                <div className="admin-alert admin-alert_error" role="alert">
                    <AlertTriangle aria-hidden="true" />
                    <div style={{ flex: 1 }}>
                        <strong>{activeState.title || DEFAULT_TITLE}</strong>
                        <p style={{ margin: "4px 0 0" }}>{activeState.message}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                            Приоритет: {activeState.priority}
                            {activeState.tablo_ids.length > 0
                                ? ` • Экранов: ${activeState.tablo_ids.length}`
                                : " • На все экраны"}
                            {activeState.auto_reset_at
                                ? ` • Авто-сброс: ${formatDateTime(activeState.auto_reset_at)}`
                                : ""}
                        </p>
                    </div>
                    <button
                        className="admin-button admin-button_secondary"
                        disabled={isSubmitting}
                        onClick={() => void handleDeactivate()}
                        type="button"
                    >
                        <ShieldCheck aria-hidden="true" />
                        Отключить
                    </button>
                </div>
            )}

            <div className="emergency-form">
                <label className="admin-field">
                    <span>Заголовок</span>
                    <input
                        maxLength={120}
                        onChange={(event) => setTitle(event.target.value)}
                        type="text"
                        value={title}
                    />
                </label>

                <label className="admin-field">
                    <span>Сообщение</span>
                    <textarea
                        maxLength={400}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Текст, который увидят жители"
                        value={message}
                    />
                </label>

                <label className="admin-field">
                    <span>Приоритет</span>
                    <select
                        onChange={(event) => setPriority(Number(event.target.value))}
                        value={priority}
                    >
                        <option value={1}>1 — обычный</option>
                        <option value={2}>2 — повышенный</option>
                        <option value={3}>3 — критический</option>
                    </select>
                </label>

                <div className="admin-field">
                    <span>Куда отправить</span>
                    <div className="target-modes">
                        <button
                            className={`target-mode-btn ${mode === "all" ? "active" : ""}`}
                            onClick={() => { setMode("all"); setSubmitError(null); }}
                            type="button"
                        >
                            <Check size={18} className="icon-check" />
                            Все экраны
                        </button>
                        <button
                            className={`target-mode-btn ${mode === "groups" ? "active" : ""}`}
                            onClick={() => { setMode("groups"); setSubmitError(null); }}
                            type="button"
                        >
                            <Users size={18} />
                            По группам
                        </button>
                        <button
                            className={`target-mode-btn ${mode === "screens" ? "active" : ""}`}
                            onClick={() => { setMode("screens"); setSubmitError(null); }}
                            type="button"
                        >
                            <Monitor size={18} />
                            Выборочно
                        </button>
                    </div>
                </div>

                {mode === "groups" && (
                    <div className="target-list">
                        {groups.length > 0 ? groups.map((group) => (
                            <label key={group} className="target-item">
                                <input
                                    checked={selectedGroups.includes(group)}
                                    onChange={() => handleToggleGroup(group)}
                                    type="checkbox"
                                />
                                <span>{group}</span>
                            </label>
                        )) : <p className="admin-muted">Группы не найдены</p>}
                    </div>
                )}

                {mode === "screens" && (
                    <div className="target-list">
                        {data.screens.length > 0 ? data.screens.map((screen) => (
                            <label key={screen.tablo_id} className="target-item">
                                <input
                                    checked={selectedTabloIds.includes(screen.tablo_id)}
                                    onChange={() => handleToggleScreen(screen.tablo_id)}
                                    type="checkbox"
                                />
                                <div className="target-item__info">
                                    <strong>{screen.name}</strong>
                                    <span>{screen.tablo_id}</span>
                                </div>
                            </label>
                        )) : <p className="admin-muted">Экраны не найдены</p>}
                    </div>
                )}

                {submitError && (
                    <div className="admin-alert admin-alert_error" role="status">
                        <span>{submitError}</span>
                    </div>
                )}

                {info && !submitError && (
                    <div className="admin-alert" role="status">
                        <span>{info}</span>
                    </div>
                )}

                <div className="admin-toolbar-actions">
                    <button
                        className="admin-button admin-button_primary"
                        disabled={isSubmitting || status === "loading"}
                        onClick={() => void handleActivate()}
                        type="button"
                    >
                        <AlertTriangle aria-hidden="true" />
                        {isSubmitting ? "Отправка..." : activeState ? "Обновить сообщение" : "Активировать"}
                    </button>
                </div>
            </div>
        </section>
    );
}

function resolveError(error: unknown, fallback: string) {
    if (isApiError(error)) return error.message;
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}