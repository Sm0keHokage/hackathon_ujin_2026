import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendTarget = process.env.ADMIN_DEV_API_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
    plugins: [react()],
    server: {
        host: "127.0.0.1",
        port: 5174,
        strictPort: true,
        proxy: {
            "/api": {
                target: backendTarget,
                changeOrigin: true,
            },
            "/docs": {
                target: backendTarget,
                changeOrigin: true,
            },
            "/openapi.json": {
                target: backendTarget,
                changeOrigin: true,
            },
        },
    },
});