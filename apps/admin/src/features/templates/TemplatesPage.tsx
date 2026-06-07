import { Edit2, Eye, Plus, Play, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { adminApi, isApiError } from "../../api";
import type { DashboardTemplateConfig, TemplateInfo } from "../../api";
import { AssignTemplateModal } from "./AssignTemplateModal";
import { DashboardPreviewFrame } from "./DashboardPreview";
import { DEFAULT_TEMPLATE_CONFIG } from "./constants";
import { openTemplatePreview } from "./previewStorage";
import { TemplateEditorModal } from "./TemplateEditorModal";

type TemplatesStatus = "idle" | "loading" | "ready";

interface TemplatesState {
    items: TemplateInfo[];
    status: TemplatesStatus;
    error: string | null;
}

export function TemplatesPage() {
    const [state, setState] = useState<TemplatesState>({
        items: [],
        status: "idle",
        error: null,
    });

    const [isCreateEditorOpen, setIsCreateEditorOpen] = useState(false);
    const [assigningTemplate, setAssigningTemplate] = useState<TemplateInfo | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<TemplateInfo | null>(null);

    const loadTemplates = async (signal?: AbortSignal) => {
        setState((current) => ({ ...current, status: "loading", error: null }));
        try {
            const templates = await adminApi.getTemplates({ signal });
            setState({ items: templates, status: "ready", error: null });
        } catch (error) {
            if (signal?.aborted) return;
            setState((current) => ({
                ...current,
                status: "ready",
                error: resolveError(error),
            }));
        }
    };

    useEffect(() => {
        const controller = new AbortController();
        void loadTemplates(controller.signal);
        return () => controller.abort();
    }, []);

    const handleCreate = () => {
        setIsCreateEditorOpen(true);
    };

    const handleDelete = async (template: TemplateInfo) => {
        if (!confirm(`Вы уверены, что хотите удалить шаблон "${template.name}"?`)) return;

        try {
            await adminApi.deleteTemplate(template.id);
            void loadTemplates();
        } catch (error) {
            alert(resolveError(error));
        }
    };

    const handlePreview = (template: TemplateInfo) => {
        const previewWindow = openTemplatePreview(template);

        if (!previewWindow) {
            alert("Не удалось открыть окно предпросмотра. Проверьте настройки блокировки всплывающих окон.");
        }
    };

    return (
        <section className="admin-panel admin-panel_full">
            <div className="screens-toolbar">
                <div className="admin-panel__heading">
                    <h2>Шаблоны</h2>
                    <p>{state.items.length} шаблонов доступно</p>
                </div>

                <div className="admin-toolbar-actions">
                    <button
                        className="admin-button admin-button_secondary"
                        disabled={state.status === "loading"}
                        onClick={() => void loadTemplates()}
                        type="button"
                    >
                        <RefreshCw aria-hidden="true" />
                        Обновить
                    </button>
                    <button
                        className="admin-button admin-button_primary"
                        onClick={handleCreate}
                        type="button"
                    >
                        <Plus aria-hidden="true" />
                        Создать шаблон
                    </button>
                </div>
            </div>

            {state.error && (
                <div className="admin-alert admin-alert_error" role="status">
                    <strong>Ошибка.</strong>
                    <span>{state.error}</span>
                </div>
            )}

            <div className="templates-grid">
                {state.status === "loading" && <p>Загрузка шаблонов...</p>}
                
                {state.status !== "loading" && state.items.map((template) => (
                    <article className="template-card" key={template.id}>
                        <div className="template-card__preview">
                            <DashboardPreviewFrame
                                config={template.config_json}
                                title={template.name}
                                variant="thumbnail"
                            />
                        </div>
                        <div className="template-card__content">
                            <div className="template-card__info">
                                <h3>{template.name}</h3>
                                <p>ID: {template.id} • {template.config_json.tiles.length} тайлов</p>
                            </div>
                            <div className="template-card__actions">
                                <button 
                                    onClick={() => handlePreview(template)}
                                    title="Открыть предпросмотр"
                                    className="admin-icon-button"
                                >
                                    <Eye size={18} />
                                </button>
                                <button 
                                    onClick={() => setAssigningTemplate(template)}
                                    title="Назначить на экраны"
                                    className="admin-icon-button admin-icon-button_success"
                                >
                                    <Play size={18} />
                                </button>
                                <button 
                                    onClick={() => setEditingTemplate(template)}
                                    title="Редактировать"
                                    className="admin-icon-button"
                                >
                                    <Edit2 size={18} />
                                </button>
                                <button 
                                    onClick={() => handleDelete(template)}
                                    title="Удалить"
                                    className="admin-icon-button admin-icon-button_danger"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    </article>
                ))}

                {state.status !== "loading" && state.items.length === 0 && (
                    <p className="admin-muted">Шаблоны еще не созданы.</p>
                )}
            </div>

            {assigningTemplate && (
                <AssignTemplateModal 
                    template={assigningTemplate}
                    onClose={() => setAssigningTemplate(null)}
                    onSuccess={() => {
                        setAssigningTemplate(null);
                        alert("Шаблон успешно назначен");
                    }}
                />
            )}

            {isCreateEditorOpen && (
                <TemplateEditorModal
                    initialConfig={createTemplateDraftConfig()}
                    initialName="Новый шаблон"
                    onClose={() => setIsCreateEditorOpen(false)}
                    onSaved={() => {
                        setIsCreateEditorOpen(false);
                        void loadTemplates();
                    }}
                />
            )}

            {editingTemplate && (
                <TemplateEditorModal
                    template={editingTemplate}
                    onClose={() => setEditingTemplate(null)}
                    onSaved={() => {
                        setEditingTemplate(null);
                        void loadTemplates();
                    }}
                />
            )}
        </section>
    );
}

function resolveError(error: unknown) {
    if (isApiError(error)) {
        return error.message;
    }
    return "Не удалось выполнить операцию";
}

function createTemplateDraftConfig(): DashboardTemplateConfig {
    const now = new Date();

    return {
        ...structuredClone(DEFAULT_TEMPLATE_CONFIG),
        id: `template-${now.getTime()}`,
        title: "Новый шаблон",
        updatedAt: now.toISOString(),
    };
}
