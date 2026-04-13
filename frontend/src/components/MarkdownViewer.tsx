import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import {
  rehypeSourceLines,
  parseFrontmatter,
  sanitizeSchema,
} from "vantage-md";
import { MermaidDiagram, FrontmatterDisplay } from "vantage-md/react";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { shouldHandleInternalNavigation } from "../lib/navigation";
import { useRepoStore } from "../stores/useRepoStore";
import { useDeltaFlash } from "../hooks/useDeltaFlash";
import { useReviewHighlights } from "../hooks/useReviewHighlights";
import { useReviewStore } from "../stores/useReviewStore";
import { ReviewCommentPopover } from "./ReviewCommentPopover";

interface MarkdownViewerProps {
  content: string;
  currentPath: string;
  isReviewMode?: boolean;
  /** e.g. "1/3" when viewing a past snapshot, null when live */
  snapshotLabel?: string | null;
}

/** Show a brief floating toast near the selection when commenting on changed text in a past snapshot. */
function showSelectionBlockedToast(rect: DOMRect) {
  const existing = document.getElementById("review-blocked-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "review-blocked-toast";
  toast.className = "review-blocked-toast";
  toast.textContent = "Go to Latest to comment on changed text";
  document.body.appendChild(toast);

  // Position near the selection
  const top = rect.top + window.scrollY - 36;
  const left = rect.left + window.scrollX + rect.width / 2;
  toast.style.top = `${Math.max(8, top)}px`;
  toast.style.left = `${left}px`;

  setTimeout(() => toast.remove(), 2500);
}

const MarkdownViewerInner: React.FC<MarkdownViewerProps> = ({
  content,
  currentPath,
  isReviewMode = false,
  snapshotLabel = null,
}) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const isMultiRepo = useRepoStore((state) => state.isMultiRepo);
  const currentRepo = useRepoStore((state) => state.currentRepo);

  // Build path with repo prefix in multi-repo mode
  const buildPath = useCallback(
    (filePath: string): string => {
      if (isMultiRepo && currentRepo) {
        return `/${currentRepo}/${filePath}`;
      }
      return `/${filePath}`;
    },
    [isMultiRepo, currentRepo],
  );

  // Get API base for content requests
  const getApiBase = useCallback((): string => {
    if (isMultiRepo && currentRepo) {
      return `/api/r/${encodeURIComponent(currentRepo)}`;
    }
    return "/api";
  }, [isMultiRepo, currentRepo]);

  // Parse frontmatter from content
  const { frontmatter, body } = useMemo(() => {
    return parseFrontmatter(content);
  }, [content]);

  const handleLinkClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      // Anchor links within the same doc: scroll inside the content container
      if (href.startsWith("#")) {
        e.preventDefault();
        const id = href.slice(1);
        const el = document.getElementById(id);
        if (el) {
          // Find the scrollable content container (has overflow-y-auto)
          const scrollContainer =
            el.closest("[data-content-scroll]") ||
            el.closest(".overflow-y-auto");
          if (scrollContainer) {
            const offset =
              el.getBoundingClientRect().top -
              scrollContainer.getBoundingClientRect().top +
              scrollContainer.scrollTop;
            scrollContainer.scrollTo({ top: offset - 16 });
          } else {
            el.scrollIntoView();
          }
        }
        return;
      }

      if (href.startsWith("http") || href.startsWith("mailto:")) return;

      // Allow browser default for Ctrl+click, Cmd+click, middle-click, etc.
      if (!shouldHandleInternalNavigation(e)) {
        return;
      }

      e.preventDefault();

      // Handle cross-doc anchor links (e.g. other-doc.md#section)
      const [pathPart, hashPart] = href.split("#");

      // Resolve relative path
      const parts = currentPath.split("/");
      parts.pop();
      const dir = parts.join("/");

      // Clean up href
      const cleanHref = pathPart.replace(/^\.\//, "");
      const resolvedPath = dir ? `${dir}/${cleanHref}` : cleanHref;

      const targetUrl =
        buildPath(resolvedPath) + (hashPart ? `#${hashPart}` : "");
      navigate(targetUrl);
    },
    [currentPath, navigate, buildPath],
  );

  const transformImageUri = useCallback(
    (uri: string, key?: string) => {
      // Only transform image sources, leave links alone as they are handled by handleLinkClick
      if (key === "href") {
        return uri;
      }

      if (uri.startsWith("http") || uri.startsWith("data:")) return uri;

      // Resolve relative path based on currentPath
      const parts = currentPath.split("/");
      parts.pop(); // remove filename
      const dir = parts.join("/");
      const resolvedPath = dir ? `${dir}/${uri}` : uri;
      const apiBase = getApiBase();

      return `${apiBase}/content?path=${encodeURIComponent(resolvedPath)}`;
    },
    [currentPath, getApiBase],
  );

  // Helper to resolve relative link paths to absolute paths
  const resolveHref = useCallback(
    (href: string | undefined): string => {
      if (!href) return "";
      if (
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("#") ||
        href.startsWith("/")
      ) {
        return href;
      }

      // Handle cross-doc anchors (e.g. other.md#section)
      const [pathPart, hashPart] = href.split("#");

      // Resolve relative path based on currentPath
      const parts = currentPath.split("/");
      parts.pop(); // remove filename
      const dir = parts.join("/");
      const cleanHref = pathPart.replace(/^\.\//, "");
      const resolvedPath = dir ? `${dir}/${cleanHref}` : cleanHref;
      return buildPath(resolvedPath) + (hashPart ? `#${hashPart}` : "");
    },
    [currentPath, buildPath],
  );

  // Delta flash: highlight only changed blocks on live updates
  useDeltaFlash(containerRef, content, currentPath);

  // --- Review mode ---
  const comments = useReviewStore((s) => s.comments);
  const snapshots = useReviewStore((s) => s.snapshots);
  const pendingSelection = useReviewStore((s) => s.pendingSelection);
  const setPendingSelection = useReviewStore((s) => s.setPendingSelection);
  const clearPendingSelection = useReviewStore((s) => s.clearPendingSelection);
  const addComment = useReviewStore((s) => s.addComment);
  const deleteComment = useReviewStore((s) => s.deleteComment);
  const resolveComment = useReviewStore((s) => s.resolveComment);

  // Which block is currently being hovered (for the hover-to-comment button).
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null);
  const hideHoverTimerRef = useRef<number | null>(null);

  const cancelHideHoverButton = useCallback(() => {
    if (hideHoverTimerRef.current !== null) {
      clearTimeout(hideHoverTimerRef.current);
      hideHoverTimerRef.current = null;
    }
  }, []);

  const scheduleHideHoverButton = useCallback(() => {
    cancelHideHoverButton();
    hideHoverTimerRef.current = window.setTimeout(() => {
      setHoveredBlock(null);
      hideHoverTimerRef.current = null;
    }, 150);
  }, [cancelHideHoverButton]);

  // Check whether a range/element is inside a changed block of a past
  // snapshot (commenting on changed text is blocked in snapshot view).
  const isInChangedBlock = useCallback(
    (container: HTMLElement, node: Node | Element | null): boolean => {
      let current = node as Element | null;
      while (current && current !== container) {
        if (
          current.nodeType === Node.ELEMENT_NODE &&
          current.hasAttribute?.("data-review-changed-block")
        ) {
          return true;
        }
        const parent: Element | null = current.parentElement;
        current = parent;
      }
      return false;
    },
    [],
  );

  const previousSnapshot =
    snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  useReviewHighlights(
    containerRef,
    isReviewMode ? comments : [],
    isReviewMode ? previousSnapshot : null,
    isReviewMode ? body : null,
    deleteComment,
    resolveComment,
    snapshotLabel,
  );

  // Capture the current window selection (if any) and promote it to a
  // pending review comment.  Returns true if something was captured.
  // Shared between mouseup and the "toggle review mode while text already
  // selected" auto-capture flow.
  const captureCurrentSelection = useCallback((): boolean => {
    const el = containerRef.current;
    if (!el) return false;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return false;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 3) return false;

    const range = selection.getRangeAt(0);
    if (
      !el.contains(range.startContainer) &&
      !el.contains(range.endContainer)
    ) {
      return false;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;

    // When viewing a past snapshot, block commenting on changed blocks.
    if (snapshotLabel) {
      const startEl = range.startContainer.parentElement;
      const endEl = range.endContainer.parentElement;
      if (isInChangedBlock(el, startEl) || isInChangedBlock(el, endEl)) {
        showSelectionBlockedToast(rect);
        return false;
      }
    }

    setPendingSelection(text, rect);
    return true;
  }, [setPendingSelection, snapshotLabel, isInChangedBlock]);

  // Text selection handler for review mode.
  // We listen on the document for mouseup so we catch selections that start
  // inside the container and end outside.  A short delay lets the browser
  // finalize the selection before we read it.
  useEffect(() => {
    if (!isReviewMode) return;
    const el = containerRef.current;
    if (!el) return;

    const handler = () => {
      // Small delay: the browser sometimes hasn't committed the selection
      // at the instant mouseup fires (especially on fast clicks).
      setTimeout(() => captureCurrentSelection(), 10);
    };

    el.addEventListener("mouseup", handler);
    return () => el.removeEventListener("mouseup", handler);
  }, [isReviewMode, captureCurrentSelection]);

  // When review mode is turned on while text is already selected, treat
  // that selection as the user's intended comment target — skips the
  // "oh I forgot to enable review mode first, now I have to reselect" chore.
  useEffect(() => {
    if (!isReviewMode) return;
    // Small delay so this runs *after* any focus/click that accompanied the
    // toggle (toolbar button click can otherwise clobber the selection).
    const id = setTimeout(() => captureCurrentSelection(), 0);
    return () => clearTimeout(id);
  }, [isReviewMode, captureCurrentSelection]);

  // Hover-to-comment: track which block the mouse is over so we can render
  // a floating "comment on this block" button.  Avoids the user having to
  // drag-select the entire paragraph by hand.
  useEffect(() => {
    if (!isReviewMode) return;
    const el = containerRef.current;
    if (!el) return;

    const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote";

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore hovering over existing inline comment blocks — those are
      // review UI, not document content.
      if (target.closest("[data-review-inline-comment]")) return;
      const block = target.closest(BLOCK_SELECTOR) as HTMLElement | null;
      if (!block || !el.contains(block)) return;
      // Skip list items that just wrap nested lists (no direct text).
      const text = (block.innerText || "").trim();
      if (text.length < 3) return;
      cancelHideHoverButton();
      setHoveredBlock((prev) => (prev === block ? prev : block));
    };

    el.addEventListener("mouseover", onOver);
    el.addEventListener("mouseleave", scheduleHideHoverButton);
    return () => {
      el.removeEventListener("mouseover", onOver);
      el.removeEventListener("mouseleave", scheduleHideHoverButton);
      cancelHideHoverButton();
      setHoveredBlock(null);
    };
  }, [isReviewMode, cancelHideHoverButton, scheduleHideHoverButton]);

  // Click-handler for the hover-to-comment button: synthesize a "selection"
  // from the block's text and open the comment popover.
  const handleCommentOnBlock = useCallback(
    (block: HTMLElement) => {
      const el = containerRef.current;
      if (!el) return;
      // Strip revision badge text if present (inserted at start of block
      // when viewing a past snapshot).
      const badge = block.querySelector(".review-revision-badge");
      let text = block.innerText || block.textContent || "";
      if (badge) {
        const badgeText = badge.textContent || "";
        if (badgeText && text.startsWith(badgeText)) {
          text = text.slice(badgeText.length);
        }
      }
      text = text.trim();
      if (text.length < 3) return;

      const rect = block.getBoundingClientRect();

      if (snapshotLabel && isInChangedBlock(el, block)) {
        showSelectionBlockedToast(rect);
        return;
      }

      setPendingSelection(text, rect);
      setHoveredBlock(null);
    },
    [setPendingSelection, snapshotLabel, isInChangedBlock],
  );

  // Position of the hover-to-comment button (fixed coords, recalculated
  // every render so it follows scroll/resize via the parent re-render).
  const hoverButtonPosition = useMemo(() => {
    if (!hoveredBlock) return null;
    const rect = hoveredBlock.getBoundingClientRect();
    // Put the button in the left gutter of the prose column.
    const BUTTON_SIZE = 24;
    const GAP = 6;
    let left = rect.left - BUTTON_SIZE - GAP;
    // If that would go off-screen, place it inside the block at top-left.
    if (left < 4) left = rect.left + 4;
    const top = rect.top + 4;
    return { top, left };
  }, [hoveredBlock]);

  // Factory for heading components with hover anchor links
  const headingWithAnchor = useCallback(
    (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => {
      const Component = ({
        id,
        children,
        ...props
      }: {
        id?: string;
        children?: React.ReactNode;
      } & React.HTMLAttributes<HTMLHeadingElement>) => (
        <Tag id={id} className="group relative" {...props}>
          {id && (
            <a
              href={`#${id}`}
              className="heading-anchor"
              aria-label="Link to this heading"
              onClick={(e) => {
                e.preventDefault();
                // Update URL hash without scrolling
                window.history.replaceState(null, "", `#${id}`);
                // Scroll to the heading
                const el = document.getElementById(id);
                if (el) {
                  const scrollContainer =
                    el.closest("[data-content-scroll]") ||
                    el.closest(".overflow-y-auto");
                  if (scrollContainer) {
                    const offset =
                      el.getBoundingClientRect().top -
                      scrollContainer.getBoundingClientRect().top +
                      scrollContainer.scrollTop;
                    scrollContainer.scrollTo({ top: offset - 16 });
                  } else {
                    el.scrollIntoView();
                  }
                }
              }}
            >
              #
            </a>
          )}
          {children}
        </Tag>
      );
      Component.displayName = Tag.toUpperCase();
      return Component;
    },
    [],
  );

  // Memoize markdown components to prevent unnecessary re-renders
  const markdownComponents = useMemo(
    () => ({
      h1: headingWithAnchor("h1"),
      h2: headingWithAnchor("h2"),
      h3: headingWithAnchor("h3"),
      h4: headingWithAnchor("h4"),
      h5: headingWithAnchor("h5"),
      h6: headingWithAnchor("h6"),
      a({
        href,
        children,
        ...props
      }: {
        href?: string;
        children?: React.ReactNode;
      } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
        const resolvedHref = resolveHref(href);
        return (
          <a
            href={resolvedHref}
            onClick={(e) => href && handleLinkClick(e, href)}
            {...props}
          >
            {children}
          </a>
        );
      },
      code(
        props: {
          children?: React.ReactNode;
          className?: string;
        } & React.HTMLAttributes<HTMLElement>,
      ) {
        const { children, className, ...rest } = props;
        const match = /language-(\w+)/.exec(className || "");
        // Check if it's a block code (has newline at end usually) or explicit class
        if (match && match[1] === "mermaid") {
          return <MermaidDiagram code={String(children).replace(/\n$/, "")} />;
        }
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
    }),
    [handleLinkClick, resolveHref, headingWithAnchor],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "prose prose-slate dark:prose-invert max-w-none",
        // Headings: GitHub-like sizing and spacing
        "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-slate-900 dark:prose-headings:text-slate-100",
        "prose-h1:text-[2em] prose-h1:mb-3 prose-h1:pb-[0.3em] prose-h1:border-b prose-h1:border-slate-200 dark:prose-h1:border-slate-700",
        "prose-h2:text-[1.5em] prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-[0.3em] prose-h2:border-b prose-h2:border-slate-200 dark:prose-h2:border-slate-700",
        "prose-h3:text-[1.25em] prose-h3:mt-6 prose-h3:mb-2",
        "prose-h4:text-[1em] prose-h4:mt-6 prose-h4:mb-2",

        // Body text: tighter line height and spacing to match GitHub
        "prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-[1.5] prose-p:my-[16px]",

        // Lists: tighter spacing
        "prose-ul:my-[16px] prose-ul:list-disc prose-li:my-0.5 prose-li:marker:text-slate-900 dark:prose-li:marker:text-slate-300",
        "prose-ol:my-[16px] prose-li:marker:text-slate-900 dark:prose-li:marker:text-slate-300",

        // Code blocks: GitHub-like light gray / dark background
        "prose-pre:bg-slate-50 dark:prose-pre:bg-slate-800 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-700 prose-pre:p-4 prose-pre:rounded-md prose-pre:text-[85%] prose-pre:leading-[1.45]",

        // Links: Standard blue
        "prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline",

        // Images
        "prose-img:rounded-lg prose-img:my-4",

        // Blockquotes: Simpler vertical bar style
        "prose-blockquote:border-l-[0.25em] prose-blockquote:border-slate-300 dark:prose-blockquote:border-slate-600 prose-blockquote:pl-4 prose-blockquote:text-slate-600 dark:prose-blockquote:text-slate-400 prose-blockquote:italic",

        // Inline code: GitHub-like style (pill, light bg)
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-[0.4em] prose-code:py-[0.2em] prose-code:rounded-md prose-code:text-slate-800 dark:prose-code:text-slate-200 prose-code:font-mono prose-code:text-[85%] prose-code:font-normal prose-code:border prose-code:border-slate-200/50 dark:prose-code:border-slate-700/50",

        // Tables: tighter styling
        "prose-table:text-sm",
        "prose-th:px-3 prose-th:py-1.5 prose-th:border prose-th:border-slate-200 dark:prose-th:border-slate-700",
        "prose-td:px-3 prose-td:py-1.5 prose-td:border prose-td:border-slate-200 dark:prose-td:border-slate-700",
      )}
    >
      <FrontmatterDisplay frontmatter={frontmatter} />
      <ReactMarkdown
        remarkPlugins={[
          [remarkGfm, { singleTilde: false }],
          [remarkMath, { singleDollarTextMath: false }],
        ]}
        rehypePlugins={[
          rehypeRaw,
          rehypeSourceLines,
          [rehypeSanitize, sanitizeSchema],
          rehypeSlug,
          rehypeHighlight,
          rehypeKatex,
        ]}
        urlTransform={transformImageUri}
        components={markdownComponents}
      >
        {body}
      </ReactMarkdown>
      {/* Review mode: comment popover for new selections */}
      {isReviewMode && pendingSelection && (
        <ReviewCommentPopover
          selectedText={pendingSelection.text}
          rect={pendingSelection.rect}
          onSave={(comment) => addComment(pendingSelection.text, comment)}
          onCancel={clearPendingSelection}
        />
      )}
      {/* Review mode: hover-to-comment button on the current block */}
      {isReviewMode &&
        !pendingSelection &&
        hoveredBlock &&
        hoverButtonPosition &&
        createPortal(
          <button
            type="button"
            onMouseEnter={cancelHideHoverButton}
            onMouseLeave={scheduleHideHoverButton}
            onClick={() => handleCommentOnBlock(hoveredBlock)}
            title="Comment on this block"
            className="review-block-comment-button"
            style={{
              position: "fixed",
              top: hoverButtonPosition.top,
              left: hoverButtonPosition.left,
            }}
          >
            <MessageSquarePlus size={14} />
          </button>,
          document.body,
        )}
    </div>
  );
};

// Memoize to prevent re-renders when parent re-renders but content hasn't changed
export const MarkdownViewer = memo(
  MarkdownViewerInner,
  (prevProps, nextProps) => {
    return (
      prevProps.content === nextProps.content &&
      prevProps.currentPath === nextProps.currentPath &&
      prevProps.isReviewMode === nextProps.isReviewMode &&
      prevProps.snapshotLabel === nextProps.snapshotLabel
    );
  },
);
