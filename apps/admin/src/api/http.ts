import { adminApiConfig } from "../config";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

interface RequestJsonOptions extends Omit<RequestInit, "body"> {
    admin?: boolean;
    body?: unknown;
    timeoutMs?: number;
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
    const { signal: externalSignal, timeoutMs, ...rest } = options;
    const timeout = timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => timeoutController.abort(new DOMException("timeout", "TimeoutError")), timeout);
    const signal = mergeSignals(externalSignal, timeoutController.signal);

    try {
        const response = await fetch(resolveApiUrl(path), {
            ...rest,
            signal,
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
    } catch (error) {
        if (timeoutController.signal.aborted && !externalSignal?.aborted) {
            throw new ApiError(0, `Превышено время ожидания (${Math.round(timeout / 1000)} с)`, undefined);
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function mergeSignals(external: AbortSignal | null | undefined, internal: AbortSignal): AbortSignal {
    if (!external) return internal;
    if (external.aborted) return external;
    const controller = new AbortController();
    const abortFromExternal = () => controller.abort(external.reason);
    const abortFromInternal = () => controller.abort(internal.reason);
    external.addEventListener("abort", abortFromExternal, { once: true });
    internal.addEventListener("abort", abortFromInternal, { once: true });
    return controller.signal;
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

    if (adminApiConfig.adminToken) {
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
