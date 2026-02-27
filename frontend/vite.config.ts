import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Drop legacy font formats (.ttf, .woff) from the build.
 * Modern browsers all support .woff2 which is smaller.
 * KaTeX CSS lists fallback formats that we don't need.
 */
function dropLegacyFonts(): Plugin {
  return {
    name: "drop-legacy-fonts",
    generateBundle(_options, bundle) {
      for (const key of Object.keys(bundle)) {
        if (/\.(ttf|woff)$/.test(key) && !/\.woff2$/.test(key)) {
          delete bundle[key];
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "..");
  const env = loadEnv(mode, envDir, "");
  const port = parseInt(env.VITE_PORT || "8201");

  return {
    plugins: [react(), dropLegacyFonts()],
    envDir: envDir,
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-katex": ["katex"],
            "vendor-markdown": [
              "react-markdown",
              "remark-gfm",
              "remark-math",
              "rehype-raw",
              "rehype-slug",
              "rehype-highlight",
              "rehype-katex",
            ],
          },
        },
      },
    },
    server: {
      port: port,
      proxy: {
        "/api": {
          target: process.env.VITE_API_TARGET || "http://localhost:8200",
          changeOrigin: true,
        },
        "/api/ws": {
          target: process.env.VITE_WS_TARGET || "ws://localhost:8200",
          ws: true,
        },
      },
    },
  };
});
