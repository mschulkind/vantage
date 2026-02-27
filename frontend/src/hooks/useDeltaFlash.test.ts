import { describe, it, expect } from "vitest";
import { applyDeltaFlash } from "./useDeltaFlash";

// Helper: create mock HTMLElements with outerHTML and classList
function mockElement(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("applyDeltaFlash", () => {
  it("flashes added elements", () => {
    const oldSnapshots = ["<p>A</p>", "<p>B</p>"];
    const newSnapshots = ["<p>A</p>", "<p>B</p>", "<p>C</p>"];
    const children = newSnapshots.map((h) => mockElement(h));

    const flashed = applyDeltaFlash(oldSnapshots, newSnapshots, children);

    expect(flashed).toBe(true);
    // Only the new element (C) should be flashed
    expect(children[0].classList.contains("animate-flash-update")).toBe(false);
    expect(children[1].classList.contains("animate-flash-update")).toBe(false);
    expect(children[2].classList.contains("animate-flash-update")).toBe(true);
  });

  it("flashes modified elements", () => {
    const oldSnapshots = ["<p>A</p>", "<p>B</p>", "<p>C</p>"];
    const newSnapshots = ["<p>A</p>", "<p>B-changed</p>", "<p>C</p>"];
    const children = newSnapshots.map((h) => mockElement(h));

    const flashed = applyDeltaFlash(oldSnapshots, newSnapshots, children);

    expect(flashed).toBe(true);
    expect(children[0].classList.contains("animate-flash-update")).toBe(false);
    expect(children[1].classList.contains("animate-flash-update")).toBe(true);
    expect(children[2].classList.contains("animate-flash-update")).toBe(false);
  });

  it("flashes elements inserted in the middle", () => {
    const oldSnapshots = ["<p>A</p>", "<p>C</p>"];
    const newSnapshots = ["<p>A</p>", "<p>B</p>", "<p>C</p>"];
    const children = newSnapshots.map((h) => mockElement(h));

    const flashed = applyDeltaFlash(oldSnapshots, newSnapshots, children);

    expect(flashed).toBe(true);
    expect(children[0].classList.contains("animate-flash-update")).toBe(false);
    expect(children[1].classList.contains("animate-flash-update")).toBe(true);
    expect(children[2].classList.contains("animate-flash-update")).toBe(false);
  });

  it("does not flash when nothing changed", () => {
    const snapshots = ["<p>A</p>", "<p>B</p>"];
    const children = snapshots.map((h) => mockElement(h));

    const flashed = applyDeltaFlash(snapshots, [...snapshots], children);

    expect(flashed).toBe(false);
    expect(children[0].classList.contains("animate-flash-update")).toBe(false);
    expect(children[1].classList.contains("animate-flash-update")).toBe(false);
  });

  it("does not flash when elements are only removed", () => {
    const oldSnapshots = ["<p>A</p>", "<p>B</p>", "<p>C</p>"];
    const newSnapshots = ["<p>A</p>", "<p>C</p>"];
    const children = newSnapshots.map((h) => mockElement(h));

    const flashed = applyDeltaFlash(oldSnapshots, newSnapshots, children);

    expect(flashed).toBe(false);
    expect(children[0].classList.contains("animate-flash-update")).toBe(false);
    expect(children[1].classList.contains("animate-flash-update")).toBe(false);
  });

  it("flashes multiple changed elements", () => {
    const oldSnapshots = ["<h1>Title</h1>", "<p>A</p>", "<p>B</p>"];
    const newSnapshots = ["<h1>New Title</h1>", "<p>A</p>", "<p>B-new</p>"];
    const children = newSnapshots.map((h) => mockElement(h));

    const flashed = applyDeltaFlash(oldSnapshots, newSnapshots, children);

    expect(flashed).toBe(true);
    expect(children[0].classList.contains("animate-flash-update")).toBe(true);
    expect(children[1].classList.contains("animate-flash-update")).toBe(false);
    expect(children[2].classList.contains("animate-flash-update")).toBe(true);
  });

  it("removes flash class on animationend", () => {
    const oldSnapshots = ["<p>old</p>"];
    const newSnapshots = ["<p>new</p>"];
    const children = newSnapshots.map((h) => mockElement(h));

    applyDeltaFlash(oldSnapshots, newSnapshots, children);
    expect(children[0].classList.contains("animate-flash-update")).toBe(true);

    // Simulate animationend
    children[0].dispatchEvent(new Event("animationend"));
    expect(children[0].classList.contains("animate-flash-update")).toBe(false);
  });

  it("handles complete content replacement", () => {
    const oldSnapshots = ["<p>X</p>", "<p>Y</p>"];
    const newSnapshots = ["<p>A</p>", "<p>B</p>", "<p>C</p>"];
    const children = newSnapshots.map((h) => mockElement(h));

    const flashed = applyDeltaFlash(oldSnapshots, newSnapshots, children);

    expect(flashed).toBe(true);
    // All new elements should be flashed since none match the old ones
    children.forEach((child) => {
      expect(child.classList.contains("animate-flash-update")).toBe(true);
    });
  });
});
