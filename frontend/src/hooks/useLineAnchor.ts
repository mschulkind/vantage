import { useEffect, useCallback, type RefObject } from "react";
import { useLocation } from "react-router-dom";

const HIGHLIGHT_CLASS = "line-anchor-highlight";

/**
 * Parse a GitHub-style line anchor hash.
 * Supports: #L42, #L42-L50, #L42-50
 * Returns null if the hash is not a line anchor.
 */
function parseLineAnchor(hash: string): { start: number; end: number } | null {
  if (!hash) return null;
  const frag = hash.startsWith("#") ? hash.slice(1) : hash;

  // #L42 or #L42-L50 or #L42-50
  const match = frag.match(/^L(\d+)(?:-L?(\d+))?$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * Hook that handles GitHub-style line anchors (#L42, #L42-L50).
 *
 * - Parses the URL hash for line references
 * - Finds block elements with matching `data-source-line` attributes
 * - Scrolls to and highlights them
 * - Dismisses on Escape or click on the highlight
 */
export function useLineAnchor(
  scrollContainerRef: RefObject<HTMLDivElement | null>,
) {
  // The markdown content lives inside the scroll container
  const containerRef = scrollContainerRef;
  const location = useLocation();

  const clearHighlights = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((node) => {
      (node as HTMLElement).classList.remove(HIGHLIGHT_CLASS);
    });
  }, [containerRef]);

  // Apply highlights when hash changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clear existing highlights
    clearHighlights();

    const range = parseLineAnchor(location.hash);
    if (!range) return;

    // Find all block elements whose source line falls in the range
    const blocks = el.querySelectorAll("[data-source-line]");
    let firstMatch: HTMLElement | null = null;

    for (const block of blocks) {
      const line = parseInt(
        (block as HTMLElement).dataset.sourceLine || "0",
        10,
      );
      if (line >= range.start && line <= range.end) {
        (block as HTMLElement).classList.add(HIGHLIGHT_CLASS);
        if (!firstMatch) firstMatch = block as HTMLElement;
      }
    }

    // If exact line not found, find the nearest block before the target line
    if (!firstMatch) {
      let closest: HTMLElement | null = null;
      let closestLine = 0;
      for (const block of blocks) {
        const line = parseInt(
          (block as HTMLElement).dataset.sourceLine || "0",
          10,
        );
        if (line <= range.start && line > closestLine) {
          closestLine = line;
          closest = block as HTMLElement;
        }
      }
      if (closest) {
        closest.classList.add(HIGHLIGHT_CLASS);
        firstMatch = closest;
      }
    }

    // Scroll to the first highlighted element
    if (firstMatch) {
      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer) {
        requestAnimationFrame(() => {
          const offset =
            firstMatch!.getBoundingClientRect().top -
            scrollContainer.getBoundingClientRect().top +
            scrollContainer.scrollTop;
          scrollContainer.scrollTo({ top: offset - 32, behavior: "smooth" });
        });
      }
    }
  }, [location.hash, containerRef, scrollContainerRef, clearHighlights]);

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearHighlights();
        // Remove the hash from the URL without navigation
        if (window.location.hash) {
          history.replaceState(null, "", window.location.pathname);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [clearHighlights]);

  // Dismiss on click anywhere in the highlighted area
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`.${HIGHLIGHT_CLASS}`)) {
        clearHighlights();
        if (window.location.hash) {
          history.replaceState(null, "", window.location.pathname);
        }
      }
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [containerRef, clearHighlights]);

  return { clearHighlights };
}
