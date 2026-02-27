import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecentsPage } from "./RecentsPage";
import { useRepoStore } from "../stores/useRepoStore";
import { useGitStore } from "../stores/useGitStore";
import { BrowserRouter } from "react-router-dom";

// Mocks
vi.mock("../stores/useRepoStore");
vi.mock("../stores/useGitStore");

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

describe("RecentsPage", () => {
  const mockLoadRepos = vi.fn();
  const mockSetCurrentRepo = vi.fn();
  const mockFetchRecentFiles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useRepoStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isMultiRepo: false,
      currentRepo: null,
      repos: [],
      reposLoaded: true,
      loadRepos: mockLoadRepos,
      setCurrentRepo: mockSetCurrentRepo,
    });

    (useGitStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      recentFiles: [],
      isRecentLoading: false,
      fetchRecentFiles: mockFetchRecentFiles,
    });

    mockUseParams.mockReturnValue({ "*": "" });
  });

  const renderPage = () =>
    render(
      <BrowserRouter>
        <RecentsPage />
      </BrowserRouter>,
    );

  it("renders the page header", () => {
    renderPage();
    expect(screen.getByText("Recently Changed")).toBeInTheDocument();
  });

  it("shows empty state when no recent files", () => {
    renderPage();
    expect(screen.getByText("No recent files found")).toBeInTheDocument();
  });

  it("shows loading spinner when loading", () => {
    (useGitStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      recentFiles: [],
      isRecentLoading: true,
      fetchRecentFiles: mockFetchRecentFiles,
    });
    renderPage();
    expect(screen.queryByText("No recent files found")).not.toBeInTheDocument();
  });

  it("renders recent files with details", () => {
    (useGitStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      recentFiles: [
        {
          path: "docs/README.md",
          date: new Date().toISOString(),
          author_name: "Alice",
          message: "Update docs",
          hexsha: "abc12345deadbeef",
          untracked: false,
        },
        {
          path: "notes.md",
          date: new Date().toISOString(),
          author_name: "",
          message: "",
          hexsha: "",
          untracked: true,
        },
      ],
      isRecentLoading: false,
      fetchRecentFiles: mockFetchRecentFiles,
    });
    renderPage();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("Update docs")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("abc12345")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(screen.getByText("Untracked")).toBeInTheDocument();
  });

  it("calls fetchRecentFiles on mount", () => {
    renderPage();
    expect(mockFetchRecentFiles).toHaveBeenCalled();
  });

  it("renders back link to root", () => {
    renderPage();
    const backLink = screen.getByTitle("Back");
    expect(backLink).toHaveAttribute("href", "/");
  });
});
