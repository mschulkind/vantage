import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ViewerPage } from "./ViewerPage";
import { useRepoStore } from "../stores/useRepoStore";
import { useGitStore } from "../stores/useGitStore";
import { useWebSocket } from "../hooks/useWebSocket";
import { BrowserRouter } from "react-router-dom";

// Mocks
vi.mock("../stores/useRepoStore");
vi.mock("../stores/useGitStore");
vi.mock("../hooks/useWebSocket");
vi.mock("../components/FileTree", () => ({
  FileTree: () => <div data-testid="file-tree">FileTree</div>,
}));
vi.mock("../components/MarkdownViewer", () => ({
  MarkdownViewer: () => <div data-testid="markdown-viewer">MarkdownViewer</div>,
}));
vi.mock("../components/DirectoryViewer", () => ({
  DirectoryViewer: () => (
    <div data-testid="directory-viewer">DirectoryViewer</div>
  ),
}));
vi.mock("../components/DiffViewer", () => ({
  DiffViewer: () => <div data-testid="diff-viewer">DiffViewer</div>,
}));

// Mock useNavigate and useParams
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

describe("ViewerPage", () => {
  const mockRefreshTree = vi.fn();
  const mockViewDirectory = vi.fn();
  const mockLoadFile = vi.fn();
  const mockFetchStatus = vi.fn();
  const mockFetchDiff = vi.fn();
  const mockExpandToPath = vi.fn();
  const mockLoadPathDirectories = vi.fn();
  const mockLoadRepos = vi.fn();
  const mockSetCurrentRepo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useRepoStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileTree: [],
      fileContent: null,
      currentDirectory: [],
      currentPath: "path/to/file.md",
      error: null,
      refreshTree: mockRefreshTree,
      viewDirectory: mockViewDirectory,
      loadFile: mockLoadFile,
      expandToPath: mockExpandToPath,
      loadPathDirectories: mockLoadPathDirectories,
      repos: [],
      isMultiRepo: false,
      reposLoaded: true,
      currentRepo: null,
      loadRepos: mockLoadRepos,
      setCurrentRepo: mockSetCurrentRepo,
    });

    (useGitStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      latestCommit: {
        hexsha: "123",
        message: "test commit",
        author: "me",
        date: new Date().toISOString(),
      },
      fetchStatus: mockFetchStatus,
      diff: null,
      showDiff: false,
      isDiffLoading: false,
      fetchDiff: mockFetchDiff,
      closeDiff: vi.fn(),
      recentFiles: [],
      repoName: null,
      history: [],
      fetchRecentFiles: vi.fn(),
      fetchRepoInfo: vi.fn(),
      fetchHistory: vi.fn(),
    });

    (useWebSocket as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => {},
    );
    mockUseParams.mockReturnValue({ "*": "path/to/file.md" });
  });

  const renderPage = () =>
    render(
      <BrowserRouter>
        <ViewerPage />
      </BrowserRouter>,
    );

  it("renders initial layout components", () => {
    renderPage();
    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(screen.getByText("Vantage")).toBeInTheDocument();
  });

  it("loads file when path ends with .md service call", () => {
    renderPage();
    expect(mockLoadFile).toHaveBeenCalledWith("path/to/file.md");
  });

  it("loads directory when path is not .md", () => {
    mockUseParams.mockReturnValue({ "*": "path/to/dir" });
    renderPage();
    expect(mockViewDirectory).toHaveBeenCalledWith("path/to/dir");
  });

  it("renders MarkdownViewer when content is available", () => {
    (useRepoStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...useRepoStore(),
      fileContent: "Some content",
      currentPath: "file.md",
    });
    renderPage();
    expect(screen.getByTestId("markdown-viewer")).toBeInTheDocument();
  });

  it("renders DirectoryViewer when currentDirectory is populated", () => {
    (useRepoStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...useRepoStore(),
      fileContent: null,
      currentDirectory: [{ name: "file", path: "file", is_dir: false }],
      currentPath: "dir",
    });
    mockUseParams.mockReturnValue({ "*": "dir" });

    renderPage();
    expect(screen.getByTestId("directory-viewer")).toBeInTheDocument();
  });

  it("shows diff viewer when showDiff is true", () => {
    (useGitStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...useGitStore(),
      showDiff: true,
      diff: { lines: [] }, // partial mock
    });
    renderPage();
    expect(screen.getByTestId("diff-viewer")).toBeInTheDocument();
  });

  it("handles breadcrumb navigation", () => {
    renderPage();
    // Breadcrumbs for path/to/file.md: root > path > to > file.md
    // Click 'path' (index 0)

    const pathCrumb = screen.getByText("path");
    fireEvent.click(pathCrumb);
    expect(mockNavigate).toHaveBeenCalledWith("/path");
  });

  it("displays error message when error state is set", () => {
    (useRepoStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileTree: [],
      fileContent: null,
      currentDirectory: null,
      currentPath: "nonexistent.md",
      error: "File not found",
      refreshTree: mockRefreshTree,
      viewDirectory: mockViewDirectory,
      loadFile: mockLoadFile,
      expandToPath: mockExpandToPath,
      loadPathDirectories: mockLoadPathDirectories,
      repos: [],
      isMultiRepo: false,
      reposLoaded: true,
      currentRepo: null,
      loadRepos: mockLoadRepos,
      setCurrentRepo: mockSetCurrentRepo,
    });

    renderPage();
    expect(screen.getByText(/File not found/i)).toBeInTheDocument();
  });

  it("displays error when navigating to non-existent file", () => {
    (useRepoStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileTree: [],
      fileContent: null,
      currentDirectory: null,
      currentPath: "does-not-exist.md",
      error: "Failed to load file content",
      refreshTree: mockRefreshTree,
      viewDirectory: mockViewDirectory,
      loadFile: mockLoadFile,
      expandToPath: mockExpandToPath,
      loadPathDirectories: mockLoadPathDirectories,
      repos: [],
      isMultiRepo: false,
      reposLoaded: true,
      currentRepo: null,
      loadRepos: mockLoadRepos,
      setCurrentRepo: mockSetCurrentRepo,
    });
    mockUseParams.mockReturnValue({ "*": "does-not-exist.md" });

    renderPage();
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
    // Path appears in both breadcrumbs and error display
    expect(
      screen.getAllByText(/does-not-exist.md/i).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
