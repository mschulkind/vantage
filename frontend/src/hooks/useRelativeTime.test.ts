import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRelativeTime } from "./useRelativeTime";

describe("useRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns relative time string with suffix by default", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const { result } = renderHook(() => useRelativeTime(date));
    expect(result.current).toContain("ago");
  });

  it("returns relative time string without suffix when addSuffix is false", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    const { result } = renderHook(() =>
      useRelativeTime(date, { addSuffix: false }),
    );
    expect(result.current).not.toContain("ago");
    expect(result.current).toContain("minute");
  });

  it("handles string dates", () => {
    const date = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useRelativeTime(date));
    expect(result.current).toContain("ago");
  });

  it("returns empty string for null date", () => {
    const { result } = renderHook(() => useRelativeTime(null));
    expect(result.current).toBe("");
  });

  it("auto-updates as time passes", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const date = new Date(now - 30 * 1000); // 30 seconds ago
    const { result } = renderHook(() => useRelativeTime(date));

    const initial = result.current;
    expect(initial).toContain("ago");

    // Advance time by 2 minutes (should cross to "2 minutes" threshold)
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(result.current).toContain("ago");
    expect(result.current).not.toBe(initial);
  });

  it("re-subscribes when date changes", () => {
    const date1 = new Date(Date.now() - 5 * 60 * 1000);
    const date2 = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const { result, rerender } = renderHook(
      ({ date }) => useRelativeTime(date),
      { initialProps: { date: date1 as Date | string } },
    );

    expect(result.current).toContain("minute");

    rerender({ date: date2 });
    expect(result.current).toContain("hour");
  });

  it("stays 'less than a minute' for the entire first 60 seconds", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    // Start at 25s old – previously this was right at the date-fns 30s flip
    const date = new Date(now - 25_000);
    const { result } = renderHook(() =>
      useRelativeTime(date, { addSuffix: false }),
    );

    expect(result.current).toBe("less than a minute");

    // Advance to 35s old (past the old 30s boundary)
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe("less than a minute");

    // Advance to 55s old – still under 60s
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(result.current).toBe("less than a minute");
  });
});
