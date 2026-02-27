import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("parses frontmatter from content", () => {
    const content = `---
title: My Article
author: John Doe
---
# Content

This is the body.`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({
      title: "My Article",
      author: "John Doe",
    });
    expect(result.body).toBe(`# Content

This is the body.`);
  });

  it("handles content without frontmatter", () => {
    const content = "# Hello World\nNo frontmatter here.";
    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("handles arrays in frontmatter", () => {
    const content = `---
tags:
  - react
  - typescript
  - testing
---
# Content`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter.tags).toEqual(["react", "typescript", "testing"]);
  });

  it("handles nested objects", () => {
    const content = `---
meta:
  description: A test
  keywords:
    - a
    - b
---
Body`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter.meta).toEqual({
      description: "A test",
      keywords: ["a", "b"],
    });
  });

  it("handles boolean values", () => {
    const content = `---
draft: true
published: false
---
Body`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter.draft).toBe(true);
    expect(result.frontmatter.published).toBe(false);
  });

  it("handles number values", () => {
    const content = `---
order: 42
version: 1.5
---
Body`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter.order).toBe(42);
    expect(result.frontmatter.version).toBe(1.5);
  });

  it("returns original content if frontmatter is malformed", () => {
    const content = `---
this is not valid yaml: [unclosed
---
Body`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("handles content starting with --- but no closing delimiter", () => {
    const content = `---
title: Incomplete
No closing delimiter here`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("handles empty frontmatter", () => {
    const content = `---
---
# Content`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("# Content");
  });
});
