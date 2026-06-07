import { CopyPlus, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { adminApi, isApiError } from "../../api";
import { useModalDismiss } from "../../ui/useModalDismiss";
import type {
    ClockTile,
    DashboardSeverity,
    DashboardStatus,
    DashboardTemplateConfig,
    DashboardTile,
    DashboardTileContent,
    DashboardTileLayout,
    DashboardTileSlot,
    DashboardTileType,
    IframeTile,
    MetricTile,
    NoticeItem,
    NoticeListTile,
    RotatingTileGroup,
    ServiceStatusItem,
    ServiceStatusTile,
    TemplateInfo,
    TextTile,
} from "../../api";

interface TemplateEditorModalProps {
    template?: TemplateInfo;
    initialName?: string;
    initialConfig?: DashboardTemplateConfig;
    onClose: () => void;
    onSaved: () => void;
}

type EditableSlotKind = "tile" | "group";

const tileTypeLabels: Record<DashboardTileType, string> = {
    clock: "Часы",
    metric: "Метрика",
    noticeList: "Список объявлений",
    serviceStatus: "Статусы сервисов",
    text: "Текст",
    iframe: "Iframe",
};

const accentLabels: Record<DashboardSeverity, string> = {
    info: "Информация",
    success: "Успех",
    warning: "Внимание",
    critical: "Критично",
};

const statusLabels: Record<DashboardStatus, string> = {
    normal: "Норма",
    planned: "Планово",
    attention: "Внимание",
    disabled: "Отключено",
};

export function TemplateEditorModal({
    template,
    initialName = "Новый шаблон",
    initialConfig,
    onClose,
    onSaved,
}: TemplateEditorModalProps) {
    const isCreateMode = template === undefined;
    const baseConfig = template?.config_json ?? initialConfig ?? createDefaultTemplateConfig();
    const [templateName, setTemplateName] = useState(template?.name ?? initialName);
    const [draftConfig, setDraftConfig] = useState<DashboardTemplateConfig>(() =>
        structuredClone(baseConfig),
    );
    const [selectedSlotId, setSelectedSlotId] = useState(
        () => baseConfig.tiles[0]?.id ?? "",
    );
    const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useModalDismiss(() => { if (!isSaving) onClose(); });

    const selectedSlot = useMemo(
        () => draftConfig.tiles.find((slot) => slot.id === selectedSlotId) ?? null,
        [draftConfig.tiles, selectedSlotId],
    );

    const selectedVariant = selectedSlot && isRotatingTileGroup(selectedSlot)
        ? selectedSlot.tiles[selectedVariantIndex] ?? selectedSlot.tiles[0] ?? null
        : null;

    const selectSlot = (slotId: string) => {
        setSelectedSlotId(slotId);
        setSelectedVariantIndex(0);
    };

    const updateConfig = (patch: Partial<DashboardTemplateConfig>) => {
        setDraftConfig((current) => ({
            ...current,
            ...patch,
        }));
    };

    const updateSelectedSlot = (nextSlot: DashboardTileSlot) => {
        const previousSlotId = selectedSlotId;

        setDraftConfig((current) => ({
            ...current,
            tiles: current.tiles.map((slot) => slot.id === previousSlotId ? nextSlot : slot),
        }));

        if (nextSlot.id !== previousSlotId) {
            setSelectedSlotId(nextSlot.id);
        }
    };

    const addTile = () => {
        const tile = createDefaultDashboardTile(draftConfig.tiles.length + 1);
        setDraftConfig((current) => ({
            ...current,
            tiles: [...current.tiles, tile],
        }));
        selectSlot(tile.id);
    };

    const addGroup = () => {
        const group = createDefaultRotatingGroup(draftConfig.tiles.length + 1);
        setDraftConfig((current) => ({
            ...current,
            tiles: [...current.tiles, group],
        }));
        selectSlot(group.id);
    };

    const deleteSelectedSlot = () => {
        if (!selectedSlot) {
            return;
        }

        if (!confirm(`Удалить "${getSlotTitle(selectedSlot)}"?`)) {
            return;
        }

        setDraftConfig((current) => {
            const nextTiles = current.tiles.filter((slot) => slot.id !== selectedSlot.id);
            setSelectedSlotId(nextTiles[0]?.id ?? "");
            setSelectedVariantIndex(0);
            return {
                ...current,
                tiles: nextTiles,
            };
        });
    };

    const saveTemplate = async () => {
        setIsSaving(true);
        setError(null);

        try {
            const nextConfig = {
                ...draftConfig,
                title: draftConfig.title.trim() || templateName.trim(),
                updatedAt: new Date().toISOString(),
            };

            if (isCreateMode) {
                await adminApi.createTemplate({
                    name: templateName.trim(),
                    config_json: nextConfig,
                });
            } else {
                await adminApi.updateTemplate(template.id, {
                    name: templateName.trim(),
                    config_json: nextConfig,
                });
            }

            onSaved();
        } catch (saveError) {
            setError(resolveError(saveError));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            className="admin-modal-overlay"
            onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}
            role="presentation"
        >
            <div
                aria-modal="true"
                className="admin-modal admin-modal_editor"
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
            >
                <header className="admin-modal__header">
                    <div>
                        <h2>{isCreateMode ? "Создание шаблона" : "Редактирование шаблона"}</h2>
                        <p>{isCreateMode ? "Новый шаблон дашборда" : template.name}</p>
                    </div>
                    <button aria-label="Закрыть" className="admin-modal__close" onClick={onClose} type="button">
                        <X size={20} />
                    </button>
                </header>

                <div className="template-editor">
                    <aside className="template-editor__sidebar">
                        <div className="template-editor__section">
                            <label className="admin-field">
                                <span>Название шаблона</span>
                                <input
                                    onChange={(event) => setTemplateName(event.target.value)}
                                    value={templateName}
                                />
                            </label>

                            <label className="admin-field">
                                <span>Заголовок на экране</span>
                                <input
                                    onChange={(event) => updateConfig({ title: event.target.value })}
                                    value={draftConfig.title}
                                />
                            </label>

                            <label className="admin-field">
                                <span>Адрес</span>
                                <input
                                    onChange={(event) => updateConfig({ address: event.target.value })}
                                    value={draftConfig.address}
                                />
                            </label>

                            <label className="admin-field">
                                <span>Отступ сетки</span>
                                <input
                                    min={0}
                                    onChange={(event) => updateConfig({
                                        grid: {
                                            ...draftConfig.grid,
                                            gap: toNumber(event.target.value, draftConfig.grid.gap),
                                        },
                                    })}
                                    type="number"
                                    value={draftConfig.grid.gap}
                                />
                            </label>
                        </div>

                        <div className="template-editor__section">
                            <div className="template-editor__section-title">
                                <strong>Слоты</strong>
                                <span>{draftConfig.tiles.length}</span>
                            </div>

                            <div className="template-editor__slots">
                                {draftConfig.tiles.map((slot) => (
                                    <button
                                        className={`template-editor__slot ${slot.id === selectedSlotId ? "template-editor__slot_active" : ""}`}
                                        key={slot.id}
                                        onClick={() => selectSlot(slot.id)}
                                        type="button"
                                    >
                                        <strong>{getSlotTitle(slot)}</strong>
                                        <span>{getSlotMeta(slot)}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="template-editor__actions">
                                <button className="admin-button admin-button_secondary" onClick={addTile} type="button">
                                    <Plus aria-hidden="true" />
                                    Тайл
                                </button>
                                <button className="admin-button admin-button_secondary" onClick={addGroup} type="button">
                                    <CopyPlus aria-hidden="true" />
                                    Ротация
                                </button>
                            </div>
                        </div>
                    </aside>

                    <section className="template-editor__body">
                        {error ? (
                            <div className="admin-alert admin-alert_error" role="alert">
                                <strong>Ошибка.</strong>
                                <span>{error}</span>
                            </div>
                        ) : null}

                        {selectedSlot ? (
                            <SlotEditor
                                onChange={updateSelectedSlot}
                                onDelete={deleteSelectedSlot}
                                onVariantChange={setSelectedVariantIndex}
                                selectedVariant={selectedVariant}
                                selectedVariantIndex={selectedVariantIndex}
                                slot={selectedSlot}
                            />
                        ) : (
                            <div className="template-editor__empty">
                                <h3>Нет выбранного слота</h3>
                                <p>Добавьте тайл или ротационную группу, чтобы начать редактирование.</p>
                            </div>
                        )}
                    </section>
                </div>

                <footer className="admin-modal__footer">
                    <button className="admin-button admin-button_secondary" onClick={onClose} type="button">
                        Отмена
                    </button>
                    <button
                        className="admin-button admin-button_primary"
                        disabled={isSaving || !templateName.trim()}
                        onClick={() => void saveTemplate()}
                        type="button"
                    >
                        <Save aria-hidden="true" />
                        {isSaving ? "Сохранение..." : isCreateMode ? "Создать" : "Сохранить"}
                    </button>
                </footer>
            </div>
        </div>
    );
}

interface SlotEditorProps {
    slot: DashboardTileSlot;
    selectedVariant: DashboardTileContent | null;
    selectedVariantIndex: number;
    onChange: (slot: DashboardTileSlot) => void;
    onDelete: () => void;
    onVariantChange: (index: number) => void;
}

function SlotEditor({
    slot,
    selectedVariant,
    selectedVariantIndex,
    onChange,
    onDelete,
    onVariantChange,
}: SlotEditorProps) {
    const slotKind: EditableSlotKind = isRotatingTileGroup(slot) ? "group" : "tile";

    const updateLayout = (layout: DashboardTileLayout) => {
        onChange({
            ...slot,
            layout,
        });
    };

    const updateSlotId = (id: string) => {
        onChange({
            ...slot,
            id,
        });
    };

    const updateTile = (tile: DashboardTileContent) => {
        if (isRotatingTileGroup(slot)) {
            onChange({
                ...slot,
                tiles: slot.tiles.map((item, index) => index === selectedVariantIndex ? tile : item),
            });
            return;
        }

        onChange({
            ...tile,
            layout: slot.layout,
        });
    };

    const addVariant = () => {
        if (!isRotatingTileGroup(slot)) {
            return;
        }

        const nextTile = createDefaultTileContent(slot.tiles.length + 1, "text");
        onChange({
            ...slot,
            tiles: [...slot.tiles, nextTile],
        });
        onVariantChange(slot.tiles.length);
    };

    const deleteVariant = () => {
        if (!isRotatingTileGroup(slot) || !selectedVariant) {
            return;
        }

        if (slot.tiles.length <= 1) {
            alert("В ротационной группе должен остаться хотя бы один тайл.");
            return;
        }

        const nextTiles = slot.tiles.filter((_, index) => index !== selectedVariantIndex);
        onChange({
            ...slot,
            tiles: nextTiles,
        });
        onVariantChange(Math.max(0, selectedVariantIndex - 1));
    };

    return (
        <div className="template-editor__form">
            <div className="template-editor__form-header">
                <div>
                    <span>{slotKind === "group" ? "Ротационная группа" : "Обычный тайл"}</span>
                    <h3>{getSlotTitle(slot)}</h3>
                </div>
                <button className="admin-icon-button admin-icon-button_danger" onClick={onDelete} title="Удалить слот" type="button">
                    <Trash2 size={18} />
                </button>
            </div>

            <div className="template-editor__grid template-editor__grid_2">
                <label className="admin-field">
                    <span>ID слота</span>
                    <input onChange={(event) => updateSlotId(event.target.value)} value={slot.id} />
                </label>

                {isRotatingTileGroup(slot) ? (
                    <label className="admin-field">
                        <span>Интервал ротации, сек.</span>
                        <input
                            min={1}
                            onChange={(event) => onChange({
                                ...slot,
                                rotationIntervalSeconds: toNumber(event.target.value, 30),
                            })}
                            type="number"
                            value={slot.rotationIntervalSeconds ?? 30}
                        />
                    </label>
                ) : null}
            </div>

            <LayoutEditor layout={slot.layout} onChange={updateLayout} />

            {isRotatingTileGroup(slot) ? (
                <div className="template-editor__variants">
                    <div className="template-editor__section-title">
                        <strong>Тайлы в позиции</strong>
                        <button className="admin-button admin-button_secondary" onClick={addVariant} type="button">
                            <Plus aria-hidden="true" />
                            Добавить
                        </button>
                    </div>

                    <div className="template-editor__variant-tabs">
                        {slot.tiles.map((tile, index) => (
                            <button
                                className={index === selectedVariantIndex ? "template-editor__variant-tab_active" : ""}
                                key={`${tile.id}-${index}`}
                                onClick={() => onVariantChange(index)}
                                type="button"
                            >
                                {tile.title || tileTypeLabels[tile.type]}
                            </button>
                        ))}
                    </div>

                    {selectedVariant ? (
                        <TileContentEditor
                            onChange={updateTile}
                            onDelete={deleteVariant}
                            tile={selectedVariant}
                        />
                    ) : null}
                </div>
            ) : (
                <TileContentEditor
                    onChange={updateTile}
                    tile={slot}
                />
            )}
        </div>
    );
}

function LayoutEditor({
    layout,
    onChange,
}: {
    layout: DashboardTileLayout;
    onChange: (layout: DashboardTileLayout) => void;
}) {
    const setPoint = (
        point: "topLeft" | "bottomRight",
        axis: "x" | "y",
        value: string,
    ) => {
        onChange({
            ...layout,
            [point]: {
                ...layout[point],
                [axis]: toNumber(value, layout[point][axis]),
            },
        });
    };

    return (
        <fieldset className="template-editor__fieldset">
            <legend>Положение на сетке</legend>
            <div className="template-editor__grid template-editor__grid_4">
                <label className="admin-field">
                    <span>X сверху</span>
                    <input min={1} max={9} type="number" value={layout.topLeft.x} onChange={(event) => setPoint("topLeft", "x", event.target.value)} />
                </label>
                <label className="admin-field">
                    <span>Y сверху</span>
                    <input min={1} max={16} type="number" value={layout.topLeft.y} onChange={(event) => setPoint("topLeft", "y", event.target.value)} />
                </label>
                <label className="admin-field">
                    <span>X снизу</span>
                    <input min={1} max={9} type="number" value={layout.bottomRight.x} onChange={(event) => setPoint("bottomRight", "x", event.target.value)} />
                </label>
                <label className="admin-field">
                    <span>Y снизу</span>
                    <input min={1} max={16} type="number" value={layout.bottomRight.y} onChange={(event) => setPoint("bottomRight", "y", event.target.value)} />
                </label>
            </div>
        </fieldset>
    );
}

interface TileContentEditorProps {
    tile: DashboardTileContent;
    onChange: (tile: DashboardTileContent) => void;
    onDelete?: () => void;
}

function TileContentEditor({ tile, onChange, onDelete }: TileContentEditorProps) {
    const updateCommon = (patch: Partial<DashboardTileContent>) => {
        onChange({
            ...tile,
            ...patch,
        } as DashboardTileContent);
    };

    const changeType = (type: DashboardTileType) => {
        onChange(createDefaultTileContent(1, type, tile));
    };

    return (
        <fieldset className="template-editor__fieldset">
            <legend>Содержимое тайла</legend>

            <div className="template-editor__grid template-editor__grid_2">
                <label className="admin-field">
                    <span>Тип</span>
                    <select value={tile.type} onChange={(event) => changeType(event.target.value as DashboardTileType)}>
                        {Object.entries(tileTypeLabels).map(([type, label]) => (
                            <option key={type} value={type}>{label}</option>
                        ))}
                    </select>
                </label>

                <label className="admin-field">
                    <span>Акцент</span>
                    <select
                        value={tile.accent ?? ""}
                        onChange={(event) => updateCommon({
                            accent: event.target.value ? event.target.value as DashboardSeverity : undefined,
                        })}
                    >
                        <option value="">Без акцента</option>
                        {Object.entries(accentLabels).map(([accent, label]) => (
                            <option key={accent} value={accent}>{label}</option>
                        ))}
                    </select>
                </label>

                <label className="admin-field">
                    <span>ID тайла</span>
                    <input value={tile.id} onChange={(event) => updateCommon({ id: event.target.value })} />
                </label>

                <label className="admin-field">
                    <span>Заголовок</span>
                    <input value={tile.title} onChange={(event) => updateCommon({ title: event.target.value })} />
                </label>
            </div>

            {renderTypeSpecificEditor(tile, onChange)}

            {onDelete ? (
                <button className="admin-button admin-button_secondary template-editor__delete-variant" onClick={onDelete} type="button">
                    <Trash2 aria-hidden="true" />
                    Удалить тайл из ротации
                </button>
            ) : null}
        </fieldset>
    );
}

function renderTypeSpecificEditor(
    tile: DashboardTileContent,
    onChange: (tile: DashboardTileContent) => void,
) {
    switch (tile.type) {
        case "clock":
            return <ClockFields tile={tile} onChange={onChange} />;
        case "metric":
            return <MetricFields tile={tile} onChange={onChange} />;
        case "noticeList":
            return <NoticeListFields tile={tile} onChange={onChange} />;
        case "serviceStatus":
            return <ServiceStatusFields tile={tile} onChange={onChange} />;
        case "text":
            return <TextFields tile={tile} onChange={onChange} />;
        case "iframe":
            return <IframeFields tile={tile} onChange={onChange} />;
    }
}

function ClockFields({ tile, onChange }: { tile: ClockTile; onChange: (tile: DashboardTileContent) => void }) {
    return (
        <div className="template-editor__grid template-editor__grid_2">
            <label className="admin-field">
                <span>Timezone</span>
                <input value={tile.timezone} onChange={(event) => onChange({ ...tile, timezone: event.target.value })} />
            </label>
            <label className="admin-field">
                <span>Подпись</span>
                <input value={tile.subtitle ?? ""} onChange={(event) => onChange({ ...tile, subtitle: event.target.value })} />
            </label>
        </div>
    );
}

function MetricFields({ tile, onChange }: { tile: MetricTile; onChange: (tile: DashboardTileContent) => void }) {
    return (
        <div className="template-editor__grid template-editor__grid_2">
            <label className="admin-field">
                <span>Значение</span>
                <input value={tile.value} onChange={(event) => onChange({ ...tile, value: event.target.value })} />
            </label>
            <label className="admin-field">
                <span>Единица</span>
                <input value={tile.unit ?? ""} onChange={(event) => onChange({ ...tile, unit: event.target.value })} />
            </label>
            <label className="admin-field">
                <span>Подпись</span>
                <input value={tile.caption ?? ""} onChange={(event) => onChange({ ...tile, caption: event.target.value })} />
            </label>
            <label className="admin-field">
                <span>Статус</span>
                <select
                    value={tile.status ?? ""}
                    onChange={(event) => onChange({
                        ...tile,
                        status: event.target.value ? event.target.value as DashboardSeverity : undefined,
                    })}
                >
                    <option value="">Без статуса</option>
                    {Object.entries(accentLabels).map(([status, label]) => (
                        <option key={status} value={status}>{label}</option>
                    ))}
                </select>
            </label>
        </div>
    );
}

function TextFields({ tile, onChange }: { tile: TextTile; onChange: (tile: DashboardTileContent) => void }) {
    return (
        <div className="template-editor__grid">
            <label className="admin-field">
                <span>Текст</span>
                <textarea value={tile.body} onChange={(event) => onChange({ ...tile, body: event.target.value })} />
            </label>
            <label className="admin-field">
                <span>Подвал</span>
                <input value={tile.footer ?? ""} onChange={(event) => onChange({ ...tile, footer: event.target.value })} />
            </label>
        </div>
    );
}

function IframeFields({ tile, onChange }: { tile: IframeTile; onChange: (tile: DashboardTileContent) => void }) {
    return (
        <div className="template-editor__grid template-editor__grid_2">
            <label className="admin-field">
                <span>URL</span>
                <input value={tile.src} onChange={(event) => onChange({ ...tile, src: event.target.value })} />
            </label>
            <label className="admin-field">
                <span>Обновление, сек.</span>
                <input
                    min={0}
                    type="number"
                    value={tile.refreshIntervalSeconds ?? 0}
                    onChange={(event) => onChange({
                        ...tile,
                        refreshIntervalSeconds: toNumber(event.target.value, 0),
                    })}
                />
            </label>
        </div>
    );
}

function NoticeListFields({ tile, onChange }: { tile: NoticeListTile; onChange: (tile: DashboardTileContent) => void }) {
    const updateItem = (index: number, patch: Partial<NoticeItem>) => {
        onChange({
            ...tile,
            items: tile.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        });
    };

    const addItem = () => {
        onChange({
            ...tile,
            items: [...tile.items, {
                id: `notice-${tile.items.length + 1}`,
                title: "Новое объявление",
                text: "",
                date: new Date().toISOString(),
                severity: "info",
            }],
        });
    };

    const deleteItem = (index: number) => {
        onChange({
            ...tile,
            items: tile.items.filter((_, itemIndex) => itemIndex !== index),
        });
    };

    return (
        <EditableList title="Объявления" onAdd={addItem}>
            {tile.items.map((item, index) => (
                <div className="template-editor__list-item" key={`${item.id}-${index}`}>
                    <div className="template-editor__grid template-editor__grid_2">
                        <label className="admin-field">
                            <span>ID</span>
                            <input value={item.id} onChange={(event) => updateItem(index, { id: event.target.value })} />
                        </label>
                        <label className="admin-field">
                            <span>Дата</span>
                            <input value={item.date ?? ""} onChange={(event) => updateItem(index, { date: event.target.value })} />
                        </label>
                        <label className="admin-field">
                            <span>Заголовок</span>
                            <input value={item.title} onChange={(event) => updateItem(index, { title: event.target.value })} />
                        </label>
                        <label className="admin-field">
                            <span>Важность</span>
                            <select
                                value={item.severity ?? ""}
                                onChange={(event) => updateItem(index, {
                                    severity: event.target.value ? event.target.value as DashboardSeverity : undefined,
                                })}
                            >
                                <option value="">Без важности</option>
                                {Object.entries(accentLabels).map(([severity, label]) => (
                                    <option key={severity} value={severity}>{label}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label className="admin-field">
                        <span>Текст</span>
                        <textarea value={item.text ?? ""} onChange={(event) => updateItem(index, { text: event.target.value })} />
                    </label>
                    <button className="admin-icon-button admin-icon-button_danger" onClick={() => deleteItem(index)} title="Удалить объявление" type="button">
                        <Trash2 size={18} />
                    </button>
                </div>
            ))}
        </EditableList>
    );
}

function ServiceStatusFields({ tile, onChange }: { tile: ServiceStatusTile; onChange: (tile: DashboardTileContent) => void }) {
    const updateItem = (index: number, patch: Partial<ServiceStatusItem>) => {
        onChange({
            ...tile,
            items: tile.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        });
    };

    const addItem = () => {
        onChange({
            ...tile,
            items: [...tile.items, {
                id: `service-${tile.items.length + 1}`,
                label: "Новый сервис",
                value: "Описание",
                status: "normal",
            }],
        });
    };

    const deleteItem = (index: number) => {
        onChange({
            ...tile,
            items: tile.items.filter((_, itemIndex) => itemIndex !== index),
        });
    };

    return (
        <EditableList title="Статусы" onAdd={addItem}>
            {tile.items.map((item, index) => (
                <div className="template-editor__list-item" key={`${item.id}-${index}`}>
                    <div className="template-editor__grid template-editor__grid_2">
                        <label className="admin-field">
                            <span>ID</span>
                            <input value={item.id} onChange={(event) => updateItem(index, { id: event.target.value })} />
                        </label>
                        <label className="admin-field">
                            <span>Статус</span>
                            <select value={item.status} onChange={(event) => updateItem(index, { status: event.target.value as DashboardStatus })}>
                                {Object.entries(statusLabels).map(([status, label]) => (
                                    <option key={status} value={status}>{label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="admin-field">
                            <span>Название</span>
                            <input value={item.label} onChange={(event) => updateItem(index, { label: event.target.value })} />
                        </label>
                        <label className="admin-field">
                            <span>Значение</span>
                            <input value={item.value} onChange={(event) => updateItem(index, { value: event.target.value })} />
                        </label>
                    </div>
                    <button className="admin-icon-button admin-icon-button_danger" onClick={() => deleteItem(index)} title="Удалить статус" type="button">
                        <Trash2 size={18} />
                    </button>
                </div>
            ))}
        </EditableList>
    );
}

function EditableList({
    title,
    children,
    onAdd,
}: {
    title: string;
    children: ReactNode;
    onAdd: () => void;
}) {
    return (
        <div className="template-editor__nested-list">
            <div className="template-editor__section-title">
                <strong>{title}</strong>
                <button className="admin-button admin-button_secondary" onClick={onAdd} type="button">
                    <Plus aria-hidden="true" />
                    Добавить
                </button>
            </div>
            <div className="template-editor__list">{children}</div>
        </div>
    );
}

function isRotatingTileGroup(slot: DashboardTileSlot): slot is RotatingTileGroup {
    return "tiles" in slot;
}

function getSlotTitle(slot: DashboardTileSlot) {
    if (isRotatingTileGroup(slot)) {
        return slot.id;
    }

    return slot.title || slot.id;
}

function getSlotMeta(slot: DashboardTileSlot) {
    const layout = `${slot.layout.topLeft.x}:${slot.layout.topLeft.y} - ${slot.layout.bottomRight.x}:${slot.layout.bottomRight.y}`;

    if (isRotatingTileGroup(slot)) {
        return `${slot.tiles.length} тайлов, ${layout}`;
    }

    return `${tileTypeLabels[slot.type]}, ${layout}`;
}

function createDefaultDashboardTile(index: number): DashboardTile {
    return {
        ...createDefaultTileContent(index, "text"),
        layout: getDefaultLayout(),
    };
}

function createDefaultRotatingGroup(index: number): RotatingTileGroup {
    return {
        id: `rotation-${index}`,
        layout: getDefaultLayout(),
        rotationIntervalSeconds: 30,
        tiles: [
            createDefaultTileContent(1, "text"),
            createDefaultTileContent(2, "metric"),
        ],
    };
}

function createDefaultTileContent(
    index: number,
    type: DashboardTileType,
    base?: DashboardTileContent,
): DashboardTileContent {
    const common = {
        id: base?.id ?? `${type}-${index}`,
        title: base?.title ?? tileTypeLabels[type],
        accent: base?.accent,
    };

    switch (type) {
        case "clock":
            return {
                ...common,
                type,
                timezone: "Europe/Moscow",
                subtitle: "Пермь",
            };
        case "metric":
            return {
                ...common,
                type,
                value: "0",
                unit: "",
                caption: "",
                status: "info",
            };
        case "noticeList":
            return {
                ...common,
                type,
                items: [],
            };
        case "serviceStatus":
            return {
                ...common,
                type,
                items: [],
            };
        case "iframe":
            return {
                ...common,
                type,
                src: "about:blank",
                refreshIntervalSeconds: 0,
            };
        case "text":
            return {
                ...common,
                type,
                body: "Новый текст",
                footer: "",
            };
    }
}

function createDefaultTemplateConfig(): DashboardTemplateConfig {
    return {
        id: `template-${Date.now()}`,
        title: "Новый шаблон",
        address: "Адрес ЖК",
        updatedAt: new Date().toISOString(),
        grid: {
            columns: 9,
            rows: 16,
            gap: 16,
        },
        tiles: [
            createDefaultDashboardTile(1),
        ],
    };
}

function getDefaultLayout(): DashboardTileLayout {
    return {
        topLeft: { x: 1, y: 1 },
        bottomRight: { x: 9, y: 3 },
    };
}

function toNumber(value: string, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveError(error: unknown) {
    if (isApiError(error)) {
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "Не удалось сохранить шаблон";
}
