import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecentsModal } from "./RecentsModal";
import { BrowserRouter } from "react-router-dom";

// Mock stores
const mockUseGitStore = vi.fn();
vi.mock("../stores/useGitStore", () => ({
  useGitStore: (...args: unknown[]) => mockUseGitStore(...args),
}));

vi.mock("../stores/useRepoStore", () => ({
  useRepoStore: vi.fn(() => ({
    isMultiRepo: false,
    currentRepo: null,
  })),
}));

const defaultStoreState = {
  recentFiles: [
    {
      path: "test.md",
      date: new Date().toISOString(),
      message: "Test commit",
      author_name: "Test Author",
      hexsha: "abc123",
      untracked: false,
    },
  ],
  isRecentLoading: false,
  recentFilesError: null,
  fetchRecentFiles: vi.fn(),
};

describe("RecentsModal", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    mockUseGitStore.mockReturnValue(defaultStoreState);
  });

  it("renders when open", () => {
    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    expect(screen.getByText("Recently Changed")).toBeInTheDocument();
    expect(screen.getByText("test.md")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <BrowserRouter>
        <RecentsModal isOpen={false} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    expect(screen.queryByText("Recently Changed")).not.toBeInTheDocument();
  });

  it("calls onClose when clicking backdrop", () => {
    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    const backdrop =
      screen.getByText("Recently Changed").parentElement?.parentElement
        ?.previousElementSibling;
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it("calls onClose when pressing Escape", async () => {
    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("calls onClose when clicking close button", () => {
    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    const closeButton = screen.getByLabelText("Close");
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("calls onClose when clicking a file link", () => {
    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    const fileLink = screen.getByText("test.md");
    fireEvent.click(fileLink);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("shows full commit message without truncation", () => {
    mockUseGitStore.mockReturnValue({
      ...defaultStoreState,
      recentFiles: [
        {
          path: "docs/design/technical_spec.md",
          date: new Date().toISOString(),
          message:
            "Fix TypeScript error: use onBeforeNavigate instead of onClick for better navigation handling in sidebar components",
          author_name: "Matt Schulkind",
          hexsha: "abc123def456",
          untracked: false,
        },
      ],
    });

    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    // Full message should be visible (not truncated)
    expect(
      screen.getByText(
        "Fix TypeScript error: use onBeforeNavigate instead of onClick for better navigation handling in sidebar components",
      ),
    ).toBeInTheDocument();
  });

  it("always shows parent directory path", () => {
    mockUseGitStore.mockReturnValue({
      ...defaultStoreState,
      recentFiles: [
        {
          path: "docs/design/technical_spec.md",
          date: new Date().toISOString(),
          message: "update",
          author_name: "Author",
          hexsha: "abc123",
          untracked: false,
        },
      ],
    });

    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    expect(screen.getByText("docs/design")).toBeInTheDocument();
  });

  it("shows author name for tracked files", () => {
    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    expect(screen.getByText("Test Author")).toBeInTheDocument();
  });

  it("shows Untracked badge for untracked files", () => {
    mockUseGitStore.mockReturnValue({
      ...defaultStoreState,
      recentFiles: [
        {
          path: "new-file.md",
          date: new Date().toISOString(),
          message: "",
          author_name: "",
          hexsha: "",
          untracked: true,
        },
      ],
    });

    render(
      <BrowserRouter>
        <RecentsModal isOpen={true} onClose={mockOnClose} />
      </BrowserRouter>,
    );

    expect(screen.getByText("Untracked")).toBeInTheDocument();
  });
});
