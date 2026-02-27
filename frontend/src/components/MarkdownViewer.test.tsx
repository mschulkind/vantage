import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MarkdownViewer } from "./MarkdownViewer";
import { BrowserRouter } from "react-router-dom";

// Mock MermaidDiagram
vi.mock("./MermaidDiagram", () => ({
  MermaidDiagram: ({ code }: { code: string }) => (
    <div data-testid="mermaid-diagram">{code}</div>
  ),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("MarkdownViewer", () => {
  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  it("renders markdown content", () => {
    const content = "# Hello World\nThis is a test.";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="test.md" />,
    );

    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("This is a test.")).toBeInTheDocument();
  });

  it("renders mermaid diagrams", () => {
    const content = "```mermaid\ngraph TD;\nA-->B;\n```";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="test.md" />,
    );

    expect(screen.getByTestId("mermaid-diagram")).toBeInTheDocument();
    // The content might have whitespace or newlines altered
    expect(screen.getByTestId("mermaid-diagram").textContent).toContain(
      "graph TD;\nA-->B;",
    );
  });

  it("handles relative links", () => {
    const content = "[Relative Link](other.md)";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="folder/current.md" />,
    );

    const link = screen.getByText("Relative Link");
    fireEvent.click(link);

    expect(mockNavigate).toHaveBeenCalledWith("/folder/other.md");
  });

  it("does not intercept external links", () => {
    const content = "[External Link](http://example.com)";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="test.md" />,
    );

    const link = screen.getByText("External Link");
    // We can't easily test navigation prevention in JSDOM unless we mock window.location or similar,
    // but we can check that navigate was NOT called with the external URL or at all for internal logic
    fireEvent.click(link);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("transforms image urls", () => {
    const content = "![Image](image.png)";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="folder/current.md" />,
    );

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/api/content?path=folder%2Fimage.png");
  });

  it("does not intercept Ctrl+click on internal links (allows new tab)", () => {
    const content = "[Internal Link](other.md)";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="folder/current.md" />,
    );

    const link = screen.getByText("Internal Link");
    fireEvent.click(link, { ctrlKey: true });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not intercept Meta/Cmd+click on internal links (allows new tab on Mac)", () => {
    const content = "[Internal Link](other.md)";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="folder/current.md" />,
    );

    const link = screen.getByText("Internal Link");
    fireEvent.click(link, { metaKey: true });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not intercept middle mouse button click on internal links", () => {
    const content = "[Internal Link](other.md)";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="folder/current.md" />,
    );

    const link = screen.getByText("Internal Link");
    fireEvent.click(link, { button: 1 });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("parses and displays frontmatter", () => {
    const content = `---
title: My Article
author: John Doe
tags:
  - react
  - testing
---

# Content

This is the body.`;

    renderWithRouter(
      <MarkdownViewer content={content} currentPath="test.md" />,
    );

    // Check frontmatter is displayed
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("My Article")).toBeInTheDocument();
    expect(screen.getByText("author")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("tags")).toBeInTheDocument();
    expect(screen.getByText("react, testing")).toBeInTheDocument();

    // Check body content is still rendered
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("This is the body.")).toBeInTheDocument();
  });

  it("does not show frontmatter section when there is none", () => {
    const content = "# Hello World\nNo frontmatter here.";
    renderWithRouter(
      <MarkdownViewer content={content} currentPath="test.md" />,
    );

    expect(screen.queryByText("Metadata")).not.toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });
});
