import React, { useRef, useEffect, useCallback } from "react";

interface MiddleEllipsisProps {
  text: string;
  className?: string;
}

/**
 * Renders text with middle-ellipsis truncation when the container is too
 * narrow.  Shows the beginning and end of the text so both the prefix and
 * extension/suffix remain visible.
 *
 * Uses direct DOM manipulation to avoid cascading re-renders from
 * ResizeObserver-driven state updates.
 */
export const MiddleEllipsis: React.FC<MiddleEllipsisProps> = ({
  text,
  className,
}) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const displayRef = useRef<HTMLSpanElement>(null);

  const truncate = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    const display = displayRef.current;
    if (!container || !measure || !display) return;

    // Reset to full text to measure natural width
    measure.textContent = text;
    const containerWidth = container.clientWidth;
    const textWidth = measure.scrollWidth;

    if (textWidth <= containerWidth) {
      display.textContent = text;
      container.removeAttribute("title");
      measure.textContent = "";
      return;
    }

    // Text needs truncation — set title for hover
    container.title = text;

    // Binary search for the right amount of chars to keep
    const ellipsis = "…";
    let lo = 4;
    let hi = text.length;

    // Keep at least 4 chars from the end (e.g. ".md" + one char)
    const tailLen = Math.min(
      Math.max(text.length - text.lastIndexOf("."), 4),
      12,
    );

    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const candidate =
        text.slice(0, mid) + ellipsis + text.slice(text.length - tailLen);
      measure.textContent = candidate;
      if (measure.scrollWidth <= containerWidth) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    display.textContent =
      text.slice(0, lo) + ellipsis + text.slice(text.length - tailLen);
    measure.textContent = "";
  }, [text]);

  useEffect(() => {
    truncate();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(truncate);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [truncate]);

  return (
    <span
      ref={containerRef}
      className={className}
      style={{
        display: "block",
        overflow: "hidden",
        whiteSpace: "nowrap",
        position: "relative",
      }}
    >
      <span ref={displayRef}>{text}</span>
      {/* Hidden measurement span — content set via JS only */}
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          height: 0,
          overflow: "hidden",
        }}
      />
    </span>
  );
};
