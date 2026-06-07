import { Check, Monitor, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { adminApi, isApiError } from "../../api";
import type { AdminTarget, AdminTargetMode, ScreenInfo, TemplateInfo } from "../../api";
import { useModalDismiss } from "../../ui/useModalDismiss";

interface AssignTemplateModalProps {
    template: TemplateInfo;
    onClose: () => void;
    onSuccess: () => void;
}

export function AssignTemplateModal({ template, onClose, onSuccess }: AssignTemplateModalProps) {
    const [screens, setScreens] = useState<ScreenInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [mode, setMode] = useState<AdminTargetMode>("all");
    const [selectedTabloIds, setSelectedTabloIds] = useState<string[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

    useModalDismiss(onClose);

    useEffect(() => {
        const controller = new AbortController();

        adminApi.getScreens({ signal: controller.signal })
            .then(setScreens)
            .catch((err) => {
                if (!controller.signal.aborted) {
                    setError(isApiError(err) ? err.message : "Не удалось загрузить список экранов");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, []);

    const groups = useMemo(() => {
        const set = new Set<string>();
        screens.forEach(s => { if (s.group_name) set.add(s.group_name); });
        return Array.from(set).sort();
    }, [screens]);

    const handleToggleScreen = (id: string) => {
        setSelectedTabloIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleToggleGroup = (name: string) => {
        setSelectedGroups(prev => 
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const handleSubmit = async () => {
        if (mode === "screens" && selectedTabloIds.length === 0) {
            setError("Выберите хотя бы один экран");
            return;
        }
        if (mode === "groups" && selectedGroups.length === 0) {
            setError("Выберите хотя бы одну группу");
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const target: AdminTarget = {
                mode,
                tablo_ids: mode === "screens" ? selectedTabloIds : [],
                group_names: mode === "groups" ? selectedGroups : [],
            };

            await adminApi.assignTemplateToTarget({
                template_id: template.id,
                target,
            });
            onSuccess();
        } catch (err) {
            setError(isApiError(err) ? err.message : "Ошибка при назначении шаблона");
        } finally {
            setIsSubmitting(false);
        }
    };

    const canSubmit =
        !isSubmitting
        && !isLoading
        && !(mode === "screens" && selectedTabloIds.length === 0)
        && !(mode === "groups" && selectedGroups.length === 0);

    return (
        <div
            className="admin-modal-overlay"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
            role="presentation"
        >
            <div
                aria-labelledby="assign-template-modal-title"
                aria-modal="true"
                className="admin-modal"
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
            >
                <header className="admin-modal__header">
                    <div>
                        <h2 id="assign-template-modal-title">Назначить шаблон</h2>
                        <p>Выбор цели для «{template.name}»</p>
                    </div>
                    <button aria-label="Закрыть" className="admin-modal__close" onClick={onClose} type="button">
                        <X size={20} />
                    </button>
                </header>

                <div className="admin-modal__body">
                    <div className="target-modes">
                        <button 
                            className={`target-mode-btn ${mode === "all" ? "active" : ""}`}
                            onClick={() => { setMode("all"); setError(null); }}
                        >
                            <Check size={18} className="icon-check" />
                            Все экраны
                        </button>
                        <button 
                            className={`target-mode-btn ${mode === "groups" ? "active" : ""}`}
                            onClick={() => { setMode("groups"); setError(null); }}
                        >
                            <Users size={18} />
                            По группам
                        </button>
                        <button 
                            className={`target-mode-btn ${mode === "screens" ? "active" : ""}`}
                            onClick={() => { setMode("screens"); setError(null); }}
                        >
                            <Monitor size={18} />
                            Выборочно
                        </button>
                    </div>

                    {error && (
                        <div className="admin-alert admin-alert_error" style={{ marginBottom: 16 }}>
                            {error}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="admin-modal__loading">Загрузка...</div>
                    ) : (
                        <div className="target-selection">
                            {mode === "all" && (
                                <div className="target-info">
                                    Шаблон будет назначен на все {screens.length} устройств.
                                </div>
                            )}

                            {mode === "groups" && (
                                <div className="target-list">
                                    {groups.length > 0 ? groups.map(group => (
                                        <label key={group} className="target-item">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedGroups.includes(group)}
                                                onChange={() => handleToggleGroup(group)}
                                            />
                                            <span>{group}</span>
                                        </label>
                                    )) : <p className="admin-muted">Группы не найдены</p>}
                                </div>
                            )}

                            {mode === "screens" && (
                                <div className="target-list">
                                    {screens.map(screen => (
                                        <label key={screen.tablo_id} className="target-item">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedTabloIds.includes(screen.tablo_id)}
                                                onChange={() => handleToggleScreen(screen.tablo_id)}
                                            />
                                            <div className="target-item__info">
                                                <strong>{screen.name}</strong>
                                                <span>{screen.tablo_id}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <footer className="admin-modal__footer">
                    <button className="admin-button admin-button_secondary" onClick={onClose} type="button">
                        Отмена
                    </button>
                    <button
                        className="admin-button admin-button_primary"
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                        type="button"
                    >
                        {isSubmitting ? "Отправка..." : "Применить"}
                    </button>
                </footer>
            </div>
        </div>
    );
}
