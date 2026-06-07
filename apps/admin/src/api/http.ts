import { adminApiConfig } from "../config";

interface RequestJsonOptions extends Omit<RequestInit, "body"> {
    admin?: boolean;
    body?: unknown;
}

type ResponsePayload = unknown;

export class ApiError extends Error {
    readonly status: number;
    readonly payload: ResponsePayload;

    constructor(status: number, message: string, payload: ResponsePayload) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.payload = payload;
    }
}

export function isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
}

export async function requestJson<T = void>(
    path: string,
    options: RequestJsonOptions = {},
): Promise<T> {
    const response = await fetch(resolveApiUrl(path), {
        ...options,
        headers: buildHeaders(options),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const payload = await readResponsePayload(response);

    if (!response.ok) {
        throw new ApiError(
            response.status,
            resolveErrorMessage(response.status, payload),
            payload,
        );
    }

    return payload as T;
}

function resolveApiUrl(path: string) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${adminApiConfig.apiBaseUrl}${normalizedPath}`;
}

function buildHeaders(options: RequestJsonOptions) {
    const headers = new Headers(options.headers);

    if (options.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    if (options.admin && adminApiConfig.adminToken) {
        headers.set("X-Admin-Token", adminApiConfig.adminToken);
    }

    return headers;
}

async function readResponsePayload(response: Response): Promise<ResponsePayload> {
    if (response.status === 204) {
        return undefined;
    }

    const text = await response.text();

    if (!text) {
        return undefined;
    }

    const contentType = response.headers.get("Content-Type") ?? "";

    if (contentType.includes("application/json")) {
        try {
            return JSON.parse(text) as unknown;
        } catch {
            return text;
        }
    }

    return text;
}

function resolveErrorMessage(status: number, payload: ResponsePayload) {
    if (typeof payload === "string" && payload.trim()) {
        return payload;
    }

    if (isRecord(payload)) {
        if (typeof payload.detail === "string") {
            return payload.detail;
        }

        if (typeof payload.message === "string") {
            return payload.message;
        }

        if (Array.isArray(payload.detail)) {
            return "Ошибка валидации данных";
        }
    }

    return `Ошибка API: ${status}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}