import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FrontmatterDisplay } from "./FrontmatterDisplay";

describe("FrontmatterDisplay", () => {
  it("renders nothing when frontmatter is empty", () => {
    const { container } = render(<FrontmatterDisplay frontmatter={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders title when present", () => {
    render(<FrontmatterDisplay frontmatter={{ title: "My Article" }} />);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("My Article")).toBeInTheDocument();
  });

  it("renders multiple properties", () => {
    render(
      <FrontmatterDisplay
        frontmatter={{
          title: "Test Title",
          author: "John Doe",
          date: "2024-01-15",
        }}
      />,
    );

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("author")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("date")).toBeInTheDocument();
    expect(screen.getByText("2024-01-15")).toBeInTheDocument();
  });

  it("renders string arrays as tag pills", () => {
    render(
      <FrontmatterDisplay
        frontmatter={{ tags: ["react", "typescript", "testing"] }}
      />,
    );

    expect(screen.getByText("tags")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("testing")).toBeInTheDocument();
  });

  it("renders nested objects as JSON", () => {
    render(
      <FrontmatterDisplay
        frontmatter={{
          meta: { description: "A test", keywords: ["a", "b"] },
        }}
      />,
    );

    expect(screen.getByText("meta")).toBeInTheDocument();
    expect(screen.getByText(/description/)).toBeInTheDocument();
  });

  it("handles boolean values", () => {
    render(
      <FrontmatterDisplay frontmatter={{ draft: true, published: false }} />,
    );

    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
  });

  it("handles number values", () => {
    render(<FrontmatterDisplay frontmatter={{ order: 42, version: 1.5 }} />);

    expect(screen.getByText("order")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("version")).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
  });

  it("flattens Zola taxonomies into top-level rows", () => {
    render(
      <FrontmatterDisplay
        frontmatter={{
          title: "My Post",
          taxonomies: {
            tags: ["rust", "zola"],
            categories: ["tutorial"],
          },
        }}
      />,
    );

    // taxonomies key should not appear; its children should be top-level
    expect(screen.queryByText("taxonomies")).not.toBeInTheDocument();
    expect(screen.getByText("tags")).toBeInTheDocument();
    expect(screen.getByText("rust")).toBeInTheDocument();
    expect(screen.getByText("zola")).toBeInTheDocument();
    expect(screen.getByText("categories")).toBeInTheDocument();
    expect(screen.getByText("tutorial")).toBeInTheDocument();
  });

  it("flattens Zola extra section into top-level rows", () => {
    render(
      <FrontmatterDisplay
        frontmatter={{
          title: "Post",
          extra: {
            author: "Jane",
            series: "Getting Started",
          },
        }}
      />,
    );

    expect(screen.queryByText("extra")).not.toBeInTheDocument();
    expect(screen.getByText("author")).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("series")).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
  });
});
