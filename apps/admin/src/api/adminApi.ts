import { requestJson } from "./http";
import type {
    ApiRequestOptions,
    EmergencyActivateRequest,
    EmergencyState,
    ScreenInfo,
    TemplateAssignRequest,
    TemplateAssignTargetRequest,
    TemplateCreateRequest,
    TemplateInfo,
    TemplateUpdateRequest,
} from "./types";

export function getScreens(options?: ApiRequestOptions) {
    return requestJson<ScreenInfo[]>("/api/screens", {
        signal: options?.signal,
    });
}

export function getTemplates(options?: ApiRequestOptions) {
    return requestJson<TemplateInfo[]>("/api/templates", {
        signal: options?.signal,
    });
}

export function getTemplate(templateId: number, options?: ApiRequestOptions) {
    return requestJson<TemplateInfo>(`/api/templates/${encodePathPart(templateId)}`, {
        signal: options?.signal,
    });
}

export function createTemplate(payload: TemplateCreateRequest, options?: ApiRequestOptions) {
    return requestJson<TemplateInfo>("/api/templates", {
        method: "POST",
        admin: true,
        body: payload,
        signal: options?.signal,
    });
}

export function updateTemplate(
    templateId: number,
    payload: TemplateUpdateRequest,
    options?: ApiRequestOptions,
) {
    return requestJson<TemplateInfo>(`/api/templates/${encodePathPart(templateId)}`, {
        method: "PATCH",
        admin: true,
        body: payload,
        signal: options?.signal,
    });
}

export function deleteTemplate(templateId: number, options?: ApiRequestOptions) {
    return requestJson<void>(`/api/templates/${encodePathPart(templateId)}`, {
        method: "DELETE",
        admin: true,
        signal: options?.signal,
    });
}

export function assignTemplate(payload: TemplateAssignRequest, options?: ApiRequestOptions) {
    return requestJson<void>("/api/templates/assign", {
        method: "POST",
        admin: true,
        body: payload,
        signal: options?.signal,
    });
}

export function assignTemplateToTarget(
    payload: TemplateAssignTargetRequest,
    options?: ApiRequestOptions,
) {
    return requestJson<void>("/api/templates/assign-target", {
        method: "POST",
        admin: true,
        body: payload,
        signal: options?.signal,
    });
}

export function getEmergencyState(options?: ApiRequestOptions) {
    return requestJson<EmergencyState>("/api/emergency/state", {
        signal: options?.signal,
    });
}

export function activateEmergency(
    payload: EmergencyActivateRequest,
    options?: ApiRequestOptions,
) {
    return requestJson<EmergencyState>("/api/emergency/activate", {
        method: "POST",
        admin: true,
        body: payload,
        signal: options?.signal,
    });
}

export function deactivateEmergency(options?: ApiRequestOptions) {
    return requestJson<EmergencyState>("/api/emergency/deactivate", {
        method: "POST",
        admin: true,
        signal: options?.signal,
    });
}

export const adminApi = {
    getScreens,
    getTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    assignTemplate,
    assignTemplateToTarget,
    getEmergencyState,
    activateEmergency,
    deactivateEmergency,
};

function encodePathPart(value: number | string) {
    return encodeURIComponent(String(value));
}