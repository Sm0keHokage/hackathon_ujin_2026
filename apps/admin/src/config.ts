function normalizeBaseUrl(value?: string) {
    const trimmedValue = value?.trim();

    if (!trimmedValue || trimmedValue === "/") {
        return "";
    }

    return trimmedValue.replace(/\/+$/, "");
}

export const adminApiConfig = {
    apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
    adminToken: import.meta.env.VITE_ADMIN_TOKEN?.trim() || "",
};

export const apiBaseUrl = adminApiConfig.apiBaseUrl || "same-origin";
