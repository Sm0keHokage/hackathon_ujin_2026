const DEFAULT_API_BASE_URL = "/";

function normalizeBaseUrl(value: string) {
    return value.replace(/\/+$/, "");
}

export const adminApiConfig = {
    apiBaseUrl: normalizeBaseUrl(
        import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
    ),
    adminToken: import.meta.env.VITE_ADMIN_TOKEN?.trim() || "",
};

export const apiBaseUrl = adminApiConfig.apiBaseUrl;