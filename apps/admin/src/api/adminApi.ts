import { requestJson } from "./http";
import type {
    AdminTarget,
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

export async function assignTemplateToTarget(
    payload: TemplateAssignTargetRequest,
    options?: ApiRequestOptions,
) {
    const tabloIds = await resolveTargetTabloIds(payload.target, options);

    await Promise.all(
        tabloIds.map((tabloId) =>
            assignTemplate(
                {
                    tablo_id: tabloId,
                    template_id: payload.template_id,
                },
                options,
            ),
        ),
    );
}

export function getEmergencyState(options?: ApiRequestOptions) {
    return requestJson<EmergencyState>("/api/emergency/state", {
        signal: options?.signal,
    });
}

export async function activateEmergency(
    payload: EmergencyActivateRequest,
    options?: ApiRequestOptions,
) {
    const tabloIds = payload.target
        ? await resolveEmergencyTabloIds(payload.target, options)
        : uniqueValues(payload.tablo_ids ?? []);

    return requestJson<EmergencyState>("/api/emergency/activate", {
        method: "POST",
        admin: true,
        body: {
            title: payload.title ?? "Внимание жильцам",
            message: payload.message,
            tablo_ids: tabloIds,
            affected_buildings: payload.affected_buildings ?? [],
            priority: payload.priority ?? 1,
        },
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

async function resolveTargetTabloIds(target: AdminTarget, options?: ApiRequestOptions) {
    if (target.mode === "screens") {
        return uniqueValues(target.tablo_ids ?? []);
    }

    const screens = await getScreens(options);

    if (target.mode === "all") {
        return uniqueValues(screens.map((screen) => screen.tablo_id));
    }

    const selectedGroups = new Set(target.group_names ?? []);

    return uniqueValues(
        screens
            .filter((screen) => screen.group_name && selectedGroups.has(screen.group_name))
            .map((screen) => screen.tablo_id),
    );
}

async function resolveEmergencyTabloIds(target: AdminTarget, options?: ApiRequestOptions) {
    if (target.mode === "all") {
        return [];
    }

    return resolveTargetTabloIds(target, options);
}

function encodePathPart(value: number | string) {
    return encodeURIComponent(String(value));
}

function uniqueValues(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}