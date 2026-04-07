import { describe, it, expect } from "vitest";
import { analyzeDoc } from "./docTips";

describe("analyzeDoc", () => {
  it("returns no tips for well-structured short docs", () => {
    const tips = analyzeDoc("# Hello\n\nSome text.\n");
    expect(tips).toEqual([]);
  });

  it("flags missing headings on long docs", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `Line ${i}`).join("\n");
    const tips = analyzeDoc(lines);
    expect(tips.some((t) => t.id === "no-headings")).toBe(true);
  });

  it("flags untagged code blocks", () => {
    const content = "# Doc\n\n```\ncode here\n```\n\nMore text.\n";
    const tips = analyzeDoc(content);
    expect(tips.some((t) => t.id === "untagged-code")).toBe(true);
  });

  it("does not flag tagged code blocks", () => {
    const content = "# Doc\n\n```python\ncode here\n```\n\nMore text.\n";
    const tips = analyzeDoc(content);
    expect(tips.some((t) => t.id === "untagged-code")).toBe(false);
  });

  it("flags missing links on long docs", () => {
    const lines = Array.from({ length: 55 }, (_, i) => `# H${i}\n\nText.`).join(
      "\n",
    );
    const tips = analyzeDoc(lines);
    expect(tips.some((t) => t.id === "no-links")).toBe(true);
  });

  it("does not flag links when they exist", () => {
    const lines = [
      "# Title",
      ...Array.from({ length: 55 }, () => "text"),
      "[a link](other.md)",
    ].join("\n");
    const tips = analyzeDoc(lines);
    expect(tips.some((t) => t.id === "no-links")).toBe(false);
  });
});
