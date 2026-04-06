import { useEffect, type RefObject } from "react";
import type { ReviewComment, ReviewSnapshot } from "../types";
import { diffWords } from "diff";

const MARK_ATTR = "data-review-comment-id";
const INLINE_COMMENT_ATTR = "data-review-inline-comment";
const BLOCK_ATTR = "data-review-changed-block";

/**
 * Imperatively highlights commented text and inserts inline comment blocks
 * into the rendered markdown DOM.  Runs as a side-effect so it doesn't
 * interfere with MarkdownViewer's memoization.
 *
 * When a comment's selected_text no longer appears in the rendered content
 * (i.e. the author changed that section), the comment is shown as an
 * "outdated" block near the best-matching paragraph — similar to GitHub's
 * outdated review comments.
 */
export function useReviewHighlights(
  containerRef: RefObject<HTMLDivElement | null>,
  comments: ReviewComment[],
  previousSnapshot: ReviewSnapshot | null,
  currentContent: string | null,
  onDeleteComment: (id: string) => void,
  onResolveComment: (id: string) => void,
) {
  // --- Comment highlights + inline comment blocks ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clean up previous marks
    el.querySelectorAll(`mark[${MARK_ATTR}]`).forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(
          document.createTextNode(mark.textContent || ""),
          mark,
        );
        parent.normalize();
      }
    });

    // Clean up previous inline comment blocks
    el.querySelectorAll(`[${INLINE_COMMENT_ATTR}]`).forEach((node) => {
      node.remove();
    });

    if (comments.length === 0) return;

    // Filter out resolved comments
    const active = comments.filter((c) => !c.resolved);
    if (active.length === 0) return;

    // For each comment: highlight the text, then insert an inline comment block
    // after the containing block-level element.
    for (const comment of active) {
      const mark = highlightText(el, comment.selected_text, comment.id);
      if (mark) {
        // Text still present — show normal inline comment
        insertInlineComment(
          el,
          mark,
          comment,
          onDeleteComment,
          onResolveComment,
          false,
        );
      } else {
        // Text not found — comment is outdated (text was changed).
        // Find the best-matching block element and insert an outdated comment there.
        insertOutdatedComment(el, comment, onDeleteComment, onResolveComment);
      }
    }
  }, [containerRef, comments, onDeleteComment, onResolveComment]);

  // --- Block-level change highlights ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clean previous block highlights
    el.querySelectorAll(`[${BLOCK_ATTR}]`).forEach((node) => {
      (node as HTMLElement).removeAttribute(BLOCK_ATTR);
      (node as HTMLElement).classList.remove("review-changed-block");
    });

    if (!previousSnapshot || !currentContent) return;

    const oldBlocks = splitBlocks(previousSnapshot.content);
    const newBlocks = splitBlocks(currentContent);
    const changedTexts = findChangedBlocks(oldBlocks, newBlocks);

    if (changedTexts.size === 0) return;

    const blockEls = el.querySelectorAll(
      "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table",
    );
    for (const blockEl of blockEls) {
      const blockText = (blockEl.textContent || "").trim();
      if (changedTexts.has(blockText)) {
        (blockEl as HTMLElement).setAttribute(BLOCK_ATTR, "true");
        (blockEl as HTMLElement).classList.add("review-changed-block");
      }
    }
  }, [containerRef, previousSnapshot, currentContent]);
}

/**
 * Find the nearest block-level ancestor of `node` that is a direct child
 * of the container (or at least a block element we can insert after).
 */
function findBlockAncestor(
  container: HTMLElement,
  node: Node,
): HTMLElement | null {
  let current = node.parentElement;
  while (current && current !== container) {
    const parent = current.parentElement;
    if (parent === container) return current;
    if (
      parent &&
      /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV|TABLE|UL|OL|SECTION)$/i.test(
        current.tagName,
      )
    ) {
      return current;
    }
    current = parent;
  }
  return current;
}

/** Insert an inline comment block after the block element containing `mark`. */
function insertInlineComment(
  container: HTMLElement,
  anchorEl: HTMLElement,
  comment: ReviewComment,
  onDelete: (id: string) => void,
  onResolve: (id: string) => void,
  isOutdated: boolean,
) {
  const blockEl = findBlockAncestor(container, anchorEl);
  if (!blockEl) return;

  const wrapper = createCommentBlock(comment, onDelete, onResolve, isOutdated);

  // Insert after the block element
  if (blockEl.nextSibling) {
    blockEl.parentNode!.insertBefore(wrapper, blockEl.nextSibling);
  } else {
    blockEl.parentNode!.appendChild(wrapper);
  }
}

/**
 * Insert an outdated comment near the best-matching block in the container.
 * Uses word overlap to find the most similar paragraph to where the comment
 * originally lived.
 */
function insertOutdatedComment(
  container: HTMLElement,
  comment: ReviewComment,
  onDelete: (id: string) => void,
  onResolve: (id: string) => void,
) {
  const blockEls = container.querySelectorAll(
    "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table",
  );

  // Find the best-matching block by word overlap with selected_text
  const commentWords = new Set(
    comment.selected_text.toLowerCase().split(/\s+/).filter(Boolean),
  );
  let bestEl: Element | null = null;
  let bestScore = 0;

  for (const blockEl of blockEls) {
    const blockText = (blockEl.textContent || "").toLowerCase();
    const blockWords = blockText.split(/\s+/).filter(Boolean);
    let overlap = 0;
    for (const w of blockWords) {
      if (commentWords.has(w)) overlap++;
    }
    // Normalize by the size of the comment to get a relevance score
    const score = commentWords.size > 0 ? overlap / commentWords.size : 0;
    if (score > bestScore) {
      bestScore = score;
      bestEl = blockEl;
    }
  }

  const wrapper = createCommentBlock(comment, onDelete, onResolve, true);

  if (bestEl && bestScore > 0.15) {
    // Insert after the best-matching block
    if (bestEl.nextSibling) {
      bestEl.parentNode!.insertBefore(wrapper, bestEl.nextSibling);
    } else {
      bestEl.parentNode!.appendChild(wrapper);
    }
  } else {
    // No good match — insert at the top of the container
    if (container.firstChild) {
      container.insertBefore(wrapper, container.firstChild);
    } else {
      container.appendChild(wrapper);
    }
  }
}

/** Create a comment block DOM element (shared by active and outdated). */
function createCommentBlock(
  comment: ReviewComment,
  onDelete: (id: string) => void,
  onResolve: (id: string) => void,
  isOutdated: boolean,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.setAttribute(INLINE_COMMENT_ATTR, comment.id);
  wrapper.className = isOutdated
    ? "review-inline-comment review-inline-comment--outdated"
    : "review-inline-comment";

  if (isOutdated) {
    // Outdated: show badge, quoted original text, comment, and resolve/delete buttons
    wrapper.innerHTML = `
      <div class="review-inline-comment-body review-inline-comment-body--outdated">
        <div class="review-inline-comment-content">
          <div class="review-outdated-badge">Outdated</div>
          <div class="review-outdated-quote"></div>
          <div class="review-inline-comment-text"></div>
        </div>
        <div class="review-inline-comment-actions">
          <button class="review-inline-comment-resolve" title="Dismiss comment">Dismiss</button>
          <button class="review-inline-comment-delete" title="Delete comment">&times;</button>
        </div>
      </div>
    `;

    // Set quoted text safely
    const quoteEl = wrapper.querySelector(".review-outdated-quote");
    if (quoteEl) quoteEl.textContent = comment.selected_text;
  } else {
    wrapper.innerHTML = `
      <div class="review-inline-comment-body">
        <div class="review-inline-comment-text"></div>
        <button class="review-inline-comment-delete" title="Delete comment">&times;</button>
      </div>
    `;
  }

  // Set comment text safely (no innerHTML for user content)
  const textEl = wrapper.querySelector(".review-inline-comment-text");
  if (textEl) textEl.textContent = comment.comment;

  // Wire up delete button
  const deleteBtn = wrapper.querySelector(".review-inline-comment-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDelete(comment.id);
    });
  }

  // Wire up resolve/dismiss button (outdated only)
  const resolveBtn = wrapper.querySelector(".review-inline-comment-resolve");
  if (resolveBtn) {
    resolveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onResolve(comment.id);
    });
  }

  return wrapper;
}

/**
 * Highlight the first occurrence of `text` inside `root` by wrapping in <mark>.
 * Returns the created mark element, or null if not found.
 */
function highlightText(
  root: HTMLElement,
  text: string,
  commentId: string,
): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  let accumulated = "";
  let startIdx = -1;
  let firstMark: HTMLElement | null = null;

  for (let i = 0; i < textNodes.length; i++) {
    accumulated += textNodes[i].textContent || "";

    const pos = accumulated.indexOf(text);
    if (pos !== -1) {
      let offset = 0;
      for (let j = startIdx === -1 ? 0 : startIdx; j <= i; j++) {
        const nodeText = textNodes[j].textContent || "";
        const nodeStart = offset;
        const nodeEnd = offset + nodeText.length;

        const matchStart = Math.max(pos, nodeStart) - nodeStart;
        const matchEnd = Math.min(pos + text.length, nodeEnd) - nodeStart;

        if (matchEnd > matchStart) {
          const range = document.createRange();
          range.setStart(textNodes[j], matchStart);
          range.setEnd(textNodes[j], matchEnd);

          const mark = document.createElement("mark");
          mark.setAttribute(MARK_ATTR, commentId);
          mark.className = "review-highlight";
          range.surroundContents(mark);
          if (!firstMark) firstMark = mark;
        }

        offset += nodeText.length;
      }
      return firstMark;
    }

    if (startIdx === -1) startIdx = i;
  }
  return null;
}

/** Split markdown into paragraph-level blocks for diffing. */
function splitBlocks(md: string): string[] {
  return md
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Find blocks in newBlocks that differ from oldBlocks (by position). */
function findChangedBlocks(
  oldBlocks: string[],
  newBlocks: string[],
): Set<string> {
  const changed = new Set<string>();
  const maxLen = Math.max(oldBlocks.length, newBlocks.length);

  for (let i = 0; i < maxLen; i++) {
    const oldB = oldBlocks[i] || "";
    const newB = newBlocks[i] || "";
    if (oldB !== newB && newB) {
      changed.add(stripMarkdown(newB));
    }
  }
  return changed;
}

/** Very rough markdown stripping — just enough to match rendered textContent. */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .trim();
}

export function getWordDiff(
  oldText: string,
  newText: string,
): Array<{ added?: boolean; removed?: boolean; value: string }> {
  return diffWords(oldText, newText);
}
