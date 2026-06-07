import { useEffect } from "react";

interface ToastProps {
    message: string;
    tone?: "info" | "success" | "error";
    onDismiss: () => void;
    durationMs?: number;
}

export function Toast({ message, tone = "info", onDismiss, durationMs = 4000 }: ToastProps) {
    useEffect(() => {
        const id = window.setTimeout(onDismiss, durationMs);
        return () => window.clearTimeout(id);
    }, [durationMs, onDismiss]);

    return (
        <div className={`admin-toast admin-toast_${tone}`} role="status">
            <span>{message}</span>
            <button aria-label="Закрыть" className="admin-toast__close" onClick={onDismiss} type="button">×</button>
        </div>
    );
}