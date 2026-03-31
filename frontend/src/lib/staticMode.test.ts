import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to test the URL rewriting logic.
// Since isStaticMode reads from window, we mock it.

describe("staticMode", () => {
  beforeEach(() => {
    // Reset module state
    vi.resetModules();
    (window as Record<string, unknown>).__VANTAGE_STATIC__ = undefined;
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).__VANTAGE_STATIC__;
  });

  describe("isStaticMode", () => {
    it("returns false when flag is not set", async () => {
      const { isStaticMode } = await import("./staticMode");
      expect(isStaticMode()).toBe(false);
    });

    it("returns true when flag is set", async () => {
      (window as Record<string, unknown>).__VANTAGE_STATIC__ = true;
      const { isStaticMode } = await import("./staticMode");
      expect(isStaticMode()).toBe(true);
    });
  });

  describe("URL rewriting (via axios interceptor)", () => {
    it("should not install interceptor when not in static mode", async () => {
      const axios = await import("axios");
      const useSpy = vi.spyOn(axios.default.interceptors.request, "use");

      const { initStaticMode } = await import("./staticMode");
      initStaticMode();

      expect(useSpy).not.toHaveBeenCalled();
      useSpy.mockRestore();
    });

    it("should install interceptor when in static mode", async () => {
      (window as Record<string, unknown>).__VANTAGE_STATIC__ = true;
      const axios = await import("axios");
      const useSpy = vi.spyOn(axios.default.interceptors.request, "use");

      const { initStaticMode } = await import("./staticMode");
      initStaticMode();

      expect(useSpy).toHaveBeenCalledOnce();
      useSpy.mockRestore();
    });

    it("should rewrite API URLs to relative JSON paths", async () => {
      (window as Record<string, unknown>).__VANTAGE_STATIC__ = true;

      const axios = await import("axios");
      const useSpy = vi.spyOn(axios.default.interceptors.request, "use");
      const { initStaticMode } = await import("./staticMode");
      initStaticMode();

      // Capture the interceptor function
      const interceptorFn = useSpy.mock.calls[0]?.[0] as unknown as (config: {
        url?: string;
        method?: string;
      }) => { url?: string; method?: string };

      if (!interceptorFn) throw new Error("Interceptor not installed");

      // Test simple endpoints
      expect(interceptorFn({ url: "/api/repos" }).url).toBe("./api/repos.json");
      expect(interceptorFn({ url: "/api/info" }).url).toBe("./api/info.json");
      expect(interceptorFn({ url: "/api/files" }).url).toBe("./api/files.json");
      expect(interceptorFn({ url: "/api/health" }).url).toBe(
        "./api/health.json",
      );

      // Test tree endpoint
      expect(interceptorFn({ url: "/api/tree?path=." }).url).toBe(
        "./api/tree/_.json",
      );
      expect(interceptorFn({ url: "/api/tree?path=docs" }).url).toBe(
        "./api/tree/docs.json",
      );

      // Test content endpoint
      expect(interceptorFn({ url: "/api/content?path=README.md" }).url).toBe(
        "./api/content/README.md.json",
      );

      // Test git endpoints
      expect(
        interceptorFn({ url: "/api/git/history?path=README.md" }).url,
      ).toBe("./api/git/history/README.md.json");
      expect(interceptorFn({ url: "/api/git/recent?limit=10" }).url).toBe(
        "./api/git/recent.json",
      );
      expect(
        interceptorFn({
          url: "/api/git/diff?path=README.md&commit=abc123",
        }).url,
      ).toBe("./api/git/diff/README.md/abc123.json");

      // Test repo-scoped URLs are stripped
      expect(
        interceptorFn({ url: "/api/r/myrepo/content?path=README.md" }).url,
      ).toBe("./api/content/README.md.json");

      useSpy.mockRestore();
    });

    it("should force GET method in static mode", async () => {
      (window as Record<string, unknown>).__VANTAGE_STATIC__ = true;

      const axios = await import("axios");
      const useSpy = vi.spyOn(axios.default.interceptors.request, "use");
      const { initStaticMode } = await import("./staticMode");
      initStaticMode();

      const interceptorFn = useSpy.mock.calls[0]?.[0] as unknown as (config: {
        url?: string;
        method?: string;
      }) => { url?: string; method?: string };

      if (!interceptorFn) throw new Error("Interceptor not installed");

      const result = interceptorFn({ url: "/api/repos", method: "post" });
      expect(result.method).toBe("get");
      useSpy.mockRestore();
    });

    it("should not rewrite non-API URLs", async () => {
      (window as Record<string, unknown>).__VANTAGE_STATIC__ = true;

      const axios = await import("axios");
      const useSpy = vi.spyOn(axios.default.interceptors.request, "use");
      const { initStaticMode } = await import("./staticMode");
      initStaticMode();

      const interceptorFn = useSpy.mock.calls[0]?.[0] as unknown as (config: {
        url?: string;
        method?: string;
      }) => { url?: string; method?: string };

      if (!interceptorFn) throw new Error("Interceptor not installed");

      expect(interceptorFn({ url: "/other/path" }).url).toBe("/other/path");
      expect(interceptorFn({ url: "https://example.com" }).url).toBe(
        "https://example.com",
      );
      useSpy.mockRestore();
    });
  });
});
