import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load .env.<mode>.local, .env.<mode>, .env.local, .env (Vite default order)
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: "./",
    plugins: [vue()],
    optimizeDeps: {
      // @sentry/vue is optional — skip pre-bundling so import-analysis doesn't fail when not installed
      exclude: ["@sentry/vue"],
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        external: ["@sentry/vue"],
        output: {
          manualChunks: (id) => {
            if (id.includes("node_modules")) {
              if (id.includes("naive-ui")) return "vendor-naive";
              if (id.includes("vue") || id.includes("@vue")) return "vendor-vue";
              if (id.includes("pinia")) return "vendor-pinia";
              if (id.includes("vue-router")) return "vendor-router";
              if (id.includes("vue-i18n")) return "vendor-i18n";
              if (id.includes("rrule")) return "vendor-rrule";
              if (id.includes("@tanstack")) return "vendor-tanstack";
              if (id.includes("@sentry")) return "vendor-sentry";
              return "vendor";
            }
            if (id.includes("@tasktick/shared")) return "shared";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@tasktick/shared": fileURLToPath(
          new URL("../../packages/shared/src/index.ts", import.meta.url),
        ),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
