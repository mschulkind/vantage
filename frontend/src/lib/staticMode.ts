/**
 * Static mode detection and API URL rewriting for Vantage.
 *
 * When the app is built with `vantage build`, the static builder injects
 * `window.__VANTAGE_STATIC__ = true` into index.html. This module detects
 * that flag and installs an axios interceptor that rewrites API requests
 * to point at pre-generated JSON files.
 *
 * URL rewriting rules:
 *   /api/repos           → /api/repos.json
 *   /api/info            → /api/info.json
 *   /api/files           → /api/files.json
 *   /api/health          → /api/health.json
 *   /api/tree?path=X     → /api/tree/X.json  (root "." → /api/tree/_.json)
 *   /api/content?path=X  → /api/content/X.json
 *   /api/git/history?path=X      → /api/git/history/X.json
 *   /api/git/status?path=X       → /api/git/status/X.json
 *   /api/git/recent?limit=N      → /api/git/recent.json
 *   /api/git/diff?path=X&commit=Y → /api/git/diff/X/Y.json
 */

import axios from "axios";

declare global {
  interface Window {
    __VANTAGE_STATIC__?: boolean;
    __VANTAGE_BASE_PATH__?: string;
  }
}

/** Whether the app is running in static (no-backend) mode. */
export const isStaticMode = (): boolean => {
  return !!window.__VANTAGE_STATIC__;
};

/** Get the base path for the static site (e.g. '/docs/'). Defaults to '/'. */
export const getStaticBasePath = (): string => {
  return window.__VANTAGE_BASE_PATH__ || "/";
};

/**
 * Parse query parameters from a URL string.
 */
function parseParams(url: string): { base: string; params: URLSearchParams } {
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return { base: url, params: new URLSearchParams() };
  return {
    base: url.substring(0, qIdx),
    params: new URLSearchParams(url.substring(qIdx + 1)),
  };
}

/**
 * Rewrite a live API URL to a static JSON file path.
 */
function rewriteUrl(url: string): string {
  const { base, params } = parseParams(url);
  const basePath = getStaticBasePath();

  // Helper to prefix the base path onto a root-relative URL
  const withBase = (path: string): string => {
    // path starts with '/', basePath ends with '/'
    // e.g. basePath='/docs/', path='/api/files.json' → '/docs/api/files.json'
    return basePath + path.slice(1);
  };

  // Strip any /api/r/{repo} prefix (static mode is always single-repo)
  const apiPath = base.replace(/^\/api\/r\/[^/]+/, "/api");

  // Simple endpoints without query params
  const simpleEndpoints = [
    "/api/repos",
    "/api/info",
    "/api/files",
    "/api/health",
  ];
  if (simpleEndpoints.includes(apiPath)) {
    return withBase(`${apiPath}.json`);
  }

  // Tree endpoint
  if (apiPath === "/api/tree") {
    const path = params.get("path") || ".";
    const treePath = path === "." ? "_" : path;
    return withBase(`/api/tree/${treePath}.json`);
  }

  // Content endpoint
  if (apiPath === "/api/content") {
    const path = params.get("path") || "";
    return withBase(`/api/content/${path}.json`);
  }

  // Git history
  if (apiPath === "/api/git/history") {
    const path = params.get("path") || "";
    return withBase(`/api/git/history/${path}.json`);
  }

  // Git status
  if (apiPath === "/api/git/status") {
    const path = params.get("path") || "";
    return withBase(`/api/git/status/${path}.json`);
  }

  // Git recent
  if (apiPath === "/api/git/recent") {
    return withBase("/api/git/recent.json");
  }

  // Git diff
  if (apiPath === "/api/git/diff") {
    const path = params.get("path") || "";
    const commit = params.get("commit") || "";
    return withBase(`/api/git/diff/${path}/${commit}.json`);
  }

  // Fallback: just append .json
  return withBase(`${apiPath}.json`);
}

/**
 * Install the static-mode axios interceptor.
 * Should be called once at app startup.
 */
export function initStaticMode(): void {
  if (!isStaticMode()) return;

  console.log("[Vantage] Running in static mode — no backend required");

  axios.interceptors.request.use((config) => {
    const url = config.url || "";

    // Only rewrite /api/* requests
    if (url.startsWith("/api/") || url.startsWith("/api?")) {
      config.url = rewriteUrl(url);
      // Force GET method (no POST/PUT/DELETE in static mode)
      config.method = "get";
    }

    return config;
  });
}
