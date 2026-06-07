import { useEffect } from "react";

export function useModalDismiss(onClose: () => void) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);
}