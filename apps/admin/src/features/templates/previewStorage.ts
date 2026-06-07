import type { DashboardTemplateConfig, TemplateInfo } from "../../api";

export const PREVIEW_ROUTE_PATH = "/preview-dashboard";

const PREVIEW_STORAGE_PREFIX = "dashboard-template-preview";

export interface StoredPreview {
    templateId: number;
    templateName: string;
    config: DashboardTemplateConfig;
}

export function openTemplatePreview(template: TemplateInfo) {
    const previewId = `${template.id}-${Date.now()}`;
    const payload: StoredPreview = {
        templateId: template.id,
        templateName: template.name,
        config: template.config_json,
    };

    window.localStorage.setItem(getPreviewStorageKey(previewId), JSON.stringify(payload));

    const url = new URL(PREVIEW_ROUTE_PATH, window.location.origin);
    url.searchParams.set("preview", previewId);

    return window.open(
        url.toString(),
        "_blank",
        "popup=yes,width=560,height=920,noopener=false",
    );
}

export function readPreviewPayload() {
    const previewId = new URLSearchParams(window.location.search).get("preview");

    if (!previewId) {
        return null;
    }

    const rawPayload = window.localStorage.getItem(getPreviewStorageKey(previewId));

    if (!rawPayload) {
        return null;
    }

    try {
        return JSON.parse(rawPayload) as StoredPreview;
    } catch {
        return null;
    }
}

function getPreviewStorageKey(previewId: string) {
    return `${PREVIEW_STORAGE_PREFIX}:${previewId}`;
}
