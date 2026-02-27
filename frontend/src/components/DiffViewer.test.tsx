import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DiffViewer } from "./DiffViewer";
import { FileDiff } from "../types";

describe("DiffViewer", () => {
  const mockDiff: FileDiff = {
    file_path: "test.py",
    commit_hexsha: "abcdef123456",
    commit_message: "Test commit",
    commit_author: "Test User",
    commit_date: "2023-01-01T00:00:00Z",
    raw_diff: "...",
    hunks: [
      {
        header: "@@ -1,1 +1,1 @@",
        lines: [
          {
            type: "header",
            content: "@@ -1,1 +1,1 @@",
            old_line_no: null,
            new_line_no: null,
          },
          {
            type: "context",
            content: "unchanged line",
            old_line_no: 1,
            new_line_no: 1,
          },
          {
            type: "delete",
            content: "removed line",
            old_line_no: 2,
            new_line_no: null,
          },
          {
            type: "add",
            content: "added line",
            old_line_no: null,
            new_line_no: 2,
          },
        ],
      },
    ],
  };

  it("renders diff content correctly", () => {
    render(<DiffViewer diff={mockDiff} onClose={() => {}} />);

    expect(screen.getByText("Test commit")).toBeInTheDocument();
    expect(screen.getByText("abcdef12")).toBeInTheDocument(); // Short hash
    expect(screen.getByText("unchanged line")).toBeInTheDocument();
    expect(screen.getByText("removed line")).toBeInTheDocument();
    expect(screen.getByText("added line")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<DiffViewer diff={mockDiff} onClose={onClose} />);

    const closeButton = screen.getByLabelText("Close diff viewer");
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders line numbers correctly", () => {
    render(<DiffViewer diff={mockDiff} onClose={() => {}} />);
    // Check for some line numbers
    const ones = screen.getAllByText("1");
    expect(ones.length).toBeGreaterThan(0);
  });
});
