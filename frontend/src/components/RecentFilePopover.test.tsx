import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RecentFilePopover } from "./RecentFilePopover";
import type { RecentFile } from "../types";

// Test data
const trackedFile: RecentFile = {
  path: "docs/design/technical_spec.md",
  date: "2025-01-15T15:30:00Z",
  author_name: "Matt Schulkind",
  message: "Fix TypeScript error: use onBeforeNavigate instead of onClick for better navigation handling",
  hexsha: "abc123def456789",
  untracked: false,
};

const untrackedFile: RecentFile = {
  path: "site/logos/image-gen-prompts.md",
  date: "2025-01-10T10:00:00Z",
  author_name: "",
  message: "",
  hexsha: "",
  untracked: true,
};

const rootFile: RecentFile = {
  path: "README.md",
  date: "2025-01-14T12:00:00Z",
  author_name: "Copilot",
  message: "updates",
  hexsha: "790a8bd5",
};

describe("RecentFilePopover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not show popover initially", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    expect(screen.queryByTestId("recent-file-popover")).not.toBeInTheDocument();
  });

  it("shows popover after hover delay", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);

    // Should NOT show immediately
    expect(screen.queryByTestId("recent-file-popover")).not.toBeInTheDocument();

    // Advance timer past delay
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId("recent-file-popover")).toBeInTheDocument();
  });

  it("hides popover on mouse leave", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId("recent-file-popover")).toBeInTheDocument();

    fireEvent.mouseLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId("recent-file-popover")).not.toBeInTheDocument();
  });

  it("cancels show if mouse leaves before delay", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(50);
    });

    fireEvent.mouseLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByTestId("recent-file-popover")).not.toBeInTheDocument();
  });

  it("displays full file path for tracked file", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(
      screen.getByText("docs/design/technical_spec.md"),
    ).toBeInTheDocument();
  });

  it("displays full commit message without truncation", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(
      screen.getByText(
        "Fix TypeScript error: use onBeforeNavigate instead of onClick for better navigation handling",
      ),
    ).toBeInTheDocument();
  });

  it("displays author name", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("Matt Schulkind")).toBeInTheDocument();
  });

  it("displays commit SHA", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("abc123de")).toBeInTheDocument();
  });

  it("displays formatted date", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Should show a formatted date (the exact format depends on format() call)
    const popover = screen.getByTestId("recent-file-popover");
    expect(popover.textContent).toContain("Jan");
    expect(popover.textContent).toContain("2025");
  });

  it("shows Untracked badge for untracked files", () => {
    render(
      <RecentFilePopover file={untrackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("Untracked")).toBeInTheDocument();
  });

  it("does not show commit info for untracked files", () => {
    render(
      <RecentFilePopover file={untrackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Should show path but no commit message/author/SHA sections
    expect(
      screen.getByText("site/logos/image-gen-prompts.md"),
    ).toBeInTheDocument();
    // No commit message icon/section for untracked
    expect(screen.queryByText("abc123de")).not.toBeInTheDocument();
  });

  it("shows file path for root-level files (no parent dir)", () => {
    render(
      <RecentFilePopover file={rootFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("keeps popover open when mouse moves from trigger to popover", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const popover = screen.getByTestId("recent-file-popover");

    // Mouse leaves trigger
    fireEvent.mouseLeave(wrapper);

    // But enters popover before hide delay completes
    fireEvent.mouseEnter(popover);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Popover should still be visible
    expect(screen.getByTestId("recent-file-popover")).toBeInTheDocument();
  });

  it("hides popover when mouse leaves the popover", () => {
    render(
      <RecentFilePopover file={trackedFile}>
        <div>Trigger</div>
      </RecentFilePopover>,
    );

    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const popover = screen.getByTestId("recent-file-popover");
    fireEvent.mouseLeave(wrapper);
    fireEvent.mouseEnter(popover);
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Now leave the popover too
    fireEvent.mouseLeave(popover);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId("recent-file-popover")).not.toBeInTheDocument();
  });
});
