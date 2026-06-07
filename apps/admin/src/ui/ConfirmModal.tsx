import { X } from "lucide-react";

import { useModalDismiss } from "./useModalDismiss";

interface ConfirmModalProps {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isSubmitting?: boolean;
    error?: string | null;
    danger?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function ConfirmModal({
    title,
    description,
    confirmLabel = "Подтвердить",
    cancelLabel = "Отмена",
    isSubmitting = false,
    error = null,
    danger = false,
    onConfirm,
    onClose,
}: ConfirmModalProps) {
    useModalDismiss(onClose);

    return (
        <div
            className="admin-modal-overlay"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
            role="presentation"
        >
            <div
                aria-modal="true"
                className="admin-modal admin-modal_compact"
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
            >
                <header className="admin-modal__header">
                    <div>
                        <h2>{title}</h2>
                        {description ? <p>{description}</p> : null}
                    </div>
                    <button aria-label="Закрыть" className="admin-modal__close" onClick={onClose} type="button">
                        <X size={20} />
                    </button>
                </header>

                {error ? (
                    <div className="admin-modal__body">
                        <div className="admin-alert admin-alert_error" role="status">
                            <span>{error}</span>
                        </div>
                    </div>
                ) : null}

                <footer className="admin-modal__footer">
                    <button className="admin-button admin-button_secondary" onClick={onClose} type="button">
                        {cancelLabel}
                    </button>
                    <button
                        className={`admin-button ${danger ? "admin-button_danger" : "admin-button_primary"}`}
                        disabled={isSubmitting}
                        onClick={onConfirm}
                        type="button"
                    >
                        {isSubmitting ? "Подождите..." : confirmLabel}
                    </button>
                </footer>
            </div>
        </div>
    );
}