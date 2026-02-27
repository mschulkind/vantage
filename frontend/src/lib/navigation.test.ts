import { describe, it, expect } from "vitest";
import { shouldHandleInternalNavigation } from "./navigation";

describe("shouldHandleInternalNavigation", () => {
  const createMouseEvent = (
    overrides: Partial<MouseEvent> = {},
  ): MouseEvent => {
    return {
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as MouseEvent;
  };

  it("returns true for regular left click", () => {
    const event = createMouseEvent();
    expect(shouldHandleInternalNavigation(event)).toBe(true);
  });

  it("returns false when Ctrl key is pressed (open in new tab)", () => {
    const event = createMouseEvent({ ctrlKey: true });
    expect(shouldHandleInternalNavigation(event)).toBe(false);
  });

  it("returns false when Meta/Cmd key is pressed (open in new tab on Mac)", () => {
    const event = createMouseEvent({ metaKey: true });
    expect(shouldHandleInternalNavigation(event)).toBe(false);
  });

  it("returns false when Shift key is pressed (open in new window)", () => {
    const event = createMouseEvent({ shiftKey: true });
    expect(shouldHandleInternalNavigation(event)).toBe(false);
  });

  it("returns false for middle mouse button click (button=1)", () => {
    const event = createMouseEvent({ button: 1 });
    expect(shouldHandleInternalNavigation(event)).toBe(false);
  });

  it("returns false for right mouse button click (button=2)", () => {
    const event = createMouseEvent({ button: 2 });
    expect(shouldHandleInternalNavigation(event)).toBe(false);
  });

  it("returns false when multiple modifier keys are pressed", () => {
    const event = createMouseEvent({ ctrlKey: true, shiftKey: true });
    expect(shouldHandleInternalNavigation(event)).toBe(false);
  });
});
