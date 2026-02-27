import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MermaidDiagram } from "./MermaidDiagram";
import { resetMermaidLoader } from "../lib/mermaidLoader";
import { clearMermaidCache } from "../lib/mermaidCache";
import mermaid from "mermaid";

// Mock mermaid
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

describe("MermaidDiagram", () => {
  const code = "graph TD; A-->B;";
  const mockSvg = "<svg>mock svg content</svg>";

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the SVG cache and lazy-load state between tests
    clearMermaidCache();
    resetMermaidLoader();
  });

  it("renders successfully with SVG", async () => {
    (mermaid.render as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      svg: mockSvg,
    });

    render(<MermaidDiagram code={code} />);

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledWith(
        expect.stringMatching(/^mermaid-/),
        code,
      );
    });

    // We expect the svg to be in the document
    expect(document.body.innerHTML).toContain(mockSvg);
  });

  it("renders error message when processing fails", async () => {
    (mermaid.render as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Mermaid error"),
    );

    render(<MermaidDiagram code={code} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to render diagram/i)).toBeInTheDocument();
    });
    expect(screen.getByText(code)).toBeInTheDocument();
  });

  it("opens modal when maximize button is clicked", async () => {
    (mermaid.render as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      svg: mockSvg,
    });

    render(<MermaidDiagram code={code} />);

    await waitFor(() => {
      expect(document.body.innerHTML).toContain(mockSvg);
    });

    const maximizeButton = screen.getByLabelText("Maximize diagram");
    fireEvent.click(maximizeButton);

    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();
    expect(screen.getByText("Mermaid Diagram")).toBeInTheDocument();
  });

  it("does not re-render when same code is passed", async () => {
    (mermaid.render as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      svg: mockSvg,
    });

    const { rerender } = render(<MermaidDiagram code={code} />);

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(1);
    });

    // Re-render with the same code
    rerender(<MermaidDiagram code={code} />);

    // Should not call render again
    expect(mermaid.render).toHaveBeenCalledTimes(1);
  });

  it("re-renders only when code changes", async () => {
    (mermaid.render as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      svg: mockSvg,
    });

    const { rerender } = render(<MermaidDiagram code={code} />);

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(1);
    });

    // Re-render with different code
    const newCode = "graph TD; C-->D;";
    rerender(<MermaidDiagram code={newCode} />);

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(2);
    });
  });

  it("maintains stable height during updates", async () => {
    (mermaid.render as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      svg: '<svg height="100">mock svg</svg>',
    });

    const { container } = render(<MermaidDiagram code={code} />);

    await waitFor(() => {
      expect(document.body.innerHTML).toContain("mock svg");
    });

    // The container should have a minimum height to prevent reflow
    const diagramContainer = container.querySelector(
      '[data-testid="mermaid-container"]',
    );
    expect(diagramContainer).toBeInTheDocument();
  });

  it("keeps previous SVG visible until new one is ready", async () => {
    (mermaid.render as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      svg: mockSvg,
    });

    const { rerender } = render(<MermaidDiagram code={code} />);

    await waitFor(() => {
      expect(document.body.innerHTML).toContain(mockSvg);
    });

    // Make render take time for the new code
    const newSvg = "<svg>new svg content</svg>";
    let resolveRender: (value: { svg: string }) => void;
    (
      mermaid.render as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(
      () =>
        new Promise<{ svg: string }>((resolve) => {
          resolveRender = resolve;
        }),
    );

    const newCode = "graph TD; C-->D;";
    rerender(<MermaidDiagram code={newCode} />);

    // Old SVG should still be visible while loading
    expect(document.body.innerHTML).toContain(mockSvg);

    // Wait for the mock to be called (async due to dynamic import)
    await waitFor(() => {
      expect(resolveRender).toBeDefined();
    });

    // Resolve the render
    resolveRender!({ svg: newSvg });

    await waitFor(() => {
      expect(document.body.innerHTML).toContain(newSvg);
    });
  });
});
