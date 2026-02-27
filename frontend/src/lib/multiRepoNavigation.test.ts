import { describe, it, expect } from "vitest";

/**
 * Tests for multi-repo URL routing behavior
 *
 * URL structure in multi-repo mode:
 * - `/` - Root shows repo selector
 * - `/{repoName}` - Shows root of that repo
 * - `/{repoName}/path/to/file.md` - Shows file in that repo
 *
 * URL structure in single-repo mode:
 * - `/` - Shows root of the repo
 * - `/path/to/file.md` - Shows file
 */

describe("Multi-repo URL parsing", () => {
  // Helper function to parse URLs like ViewerPage does
  const parseMultiRepoUrl = (pathParam: string, repos: { name: string }[]) => {
    const segments = pathParam.split("/").filter(Boolean);

    if (segments.length === 0) {
      return { repoName: null, filePath: null };
    }

    const repoName = segments[0];
    const repoExists = repos.some((r) => r.name === repoName);

    if (!repoExists) {
      return { repoName: null, filePath: null };
    }

    const filePath = segments.slice(1).join("/") || ".";
    return { repoName, filePath };
  };

  const mockRepos = [
    { name: "notes" },
    { name: "work" },
    { name: "project-docs" },
  ];

  it("parses root URL as no repo selected", () => {
    const result = parseMultiRepoUrl("", mockRepos);
    expect(result.repoName).toBeNull();
    expect(result.filePath).toBeNull();
  });

  it("parses repo-only URL", () => {
    const result = parseMultiRepoUrl("notes", mockRepos);
    expect(result.repoName).toBe("notes");
    expect(result.filePath).toBe(".");
  });

  it("parses repo with file path", () => {
    const result = parseMultiRepoUrl("notes/docs/readme.md", mockRepos);
    expect(result.repoName).toBe("notes");
    expect(result.filePath).toBe("docs/readme.md");
  });

  it("parses repo with nested directory path", () => {
    const result = parseMultiRepoUrl(
      "work/src/components/Button.tsx",
      mockRepos,
    );
    expect(result.repoName).toBe("work");
    expect(result.filePath).toBe("src/components/Button.tsx");
  });

  it("handles unknown repo name", () => {
    const result = parseMultiRepoUrl("unknown/file.md", mockRepos);
    expect(result.repoName).toBeNull();
    expect(result.filePath).toBeNull();
  });

  it("handles repo names with dashes", () => {
    const result = parseMultiRepoUrl("project-docs/index.md", mockRepos);
    expect(result.repoName).toBe("project-docs");
    expect(result.filePath).toBe("index.md");
  });
});

describe("Multi-repo URL building", () => {
  // Helper function to build URLs like the components do
  const buildPath = (
    filePath: string,
    isMultiRepo: boolean,
    currentRepo: string | null,
  ): string => {
    if (isMultiRepo && currentRepo) {
      return `/${currentRepo}/${filePath}`;
    }
    return `/${filePath}`;
  };

  it("builds path in single-repo mode", () => {
    expect(buildPath("docs/readme.md", false, null)).toBe("/docs/readme.md");
  });

  it("builds path in multi-repo mode with repo selected", () => {
    expect(buildPath("docs/readme.md", true, "notes")).toBe(
      "/notes/docs/readme.md",
    );
  });

  it("builds root path in multi-repo mode", () => {
    expect(buildPath(".", true, "notes")).toBe("/notes/.");
  });

  it("handles paths without leading slash", () => {
    expect(buildPath("file.md", true, "work")).toBe("/work/file.md");
  });
});

describe("Breadcrumb navigation in multi-repo mode", () => {
  // Simulate breadcrumb click behavior
  const handleBreadcrumbClick = (
    currentPath: string,
    index: number,
    isMultiRepo: boolean,
    currentRepo: string | null,
  ): string => {
    const parts = currentPath.split("/");
    const path = parts.slice(0, index + 1).join("/") || ".";

    if (path === ".") {
      return isMultiRepo && currentRepo ? `/${currentRepo}` : "/";
    }

    if (isMultiRepo && currentRepo) {
      return `/${currentRepo}/${path}`;
    }
    return `/${path}`;
  };

  it("navigates to repo root when clicking first breadcrumb in multi-repo mode", () => {
    const result = handleBreadcrumbClick("docs/readme.md", -1, true, "notes");
    expect(result).toBe("/notes");
  });

  it("navigates to subdirectory in multi-repo mode", () => {
    const result = handleBreadcrumbClick(
      "docs/api/readme.md",
      0,
      true,
      "notes",
    );
    expect(result).toBe("/notes/docs");
  });

  it("navigates in single-repo mode", () => {
    const result = handleBreadcrumbClick("docs/readme.md", 0, false, null);
    expect(result).toBe("/docs");
  });

  it("navigates to root in single-repo mode", () => {
    const result = handleBreadcrumbClick("readme.md", -1, false, null);
    expect(result).toBe("/");
  });
});
