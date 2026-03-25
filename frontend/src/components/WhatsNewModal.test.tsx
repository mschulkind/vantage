import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhatsNewModal } from "./WhatsNewModal";

vi.mock("virtual:changelog", () => ({
  changelog: [
    {
      version: "0.2.0",
      date: "2026-03-25",
      sections: [
        {
          title: "Added",
          items: ["**Global search** — Search across all repos"],
        },
        { title: "Fixed", items: ["Fixed timezone display"] },
      ],
    },
    {
      version: "0.1.0",
      date: "2026-03-20",
      sections: [{ title: "Added", items: ["Initial release"] }],
    },
  ],
  appVersion: "0.2.0",
}));

describe("WhatsNewModal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <WhatsNewModal isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders modal content when open", () => {
    render(<WhatsNewModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText("What's New")).toBeInTheDocument();
  });

  it("shows changelog entries", () => {
    render(<WhatsNewModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getAllByText("v0.2.0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Added").length).toBeGreaterThanOrEqual(1);
  });

  it("shows only new entries since last seen version", () => {
    localStorage.setItem("vantage:lastSeenVersion", "0.1.0");
    render(<WhatsNewModal isOpen={true} onClose={vi.fn()} />);
    // v0.2.0 appears both in the header badge and as an entry heading
    expect(screen.getAllByText("v0.2.0").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("v0.1.0")).not.toBeInTheDocument();
  });

  it("saves version to localStorage on close", () => {
    const onClose = vi.fn();
    render(<WhatsNewModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Got it"));
    expect(localStorage.getItem("vantage:lastSeenVersion")).toBe("0.2.0");
    expect(onClose).toHaveBeenCalled();
  });

  it("saves opt-out preference", () => {
    const onClose = vi.fn();
    render(<WhatsNewModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Don't show automatically"));
    fireEvent.click(screen.getByText("Got it"));
    expect(localStorage.getItem("vantage:whatsNewOptOut")).toBe("true");
  });

  it("shows up-to-date message when no new entries", () => {
    localStorage.setItem("vantage:lastSeenVersion", "0.2.0");
    render(<WhatsNewModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/up to date/)).toBeInTheDocument();
  });
});
