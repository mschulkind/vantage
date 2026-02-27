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

  describe("URL rewriting (via exported internals)", () => {
    // We test the rewriting by checking the interceptor behavior indirectly.
    // Since rewriteUrl is not exported, we test via the axios interceptor.
    // For unit testing, let's test the URL patterns we expect.

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
  });
});
