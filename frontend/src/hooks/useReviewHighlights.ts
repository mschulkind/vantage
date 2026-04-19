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
 * "Outdated" comments: a comment is outdated when its saved `selected_text`
 * no longer appears anywhere in the rendered document — meaning the author
 * actually rewrote that section after the comment was made, so we can't
 * highlight it in place.  Such comments are shown as a muted block near the
 * best-matching paragraph, labeled "Outdated", similar to GitHub's outdated
 * review comments.
 *
 * If the text IS still present but `highlightText` couldn't pin it down to
 * a specific `Range` (this happens when the selection spans multiple block
 * elements, contains mixed inline formatting, or crosses line breaks in
 * ways that defeat fuzzy text-node matching), we fall back to showing the
 * comment as a *normal* (non-outdated) block at the best-matching block.
 * Only genuinely-missing text gets the "Outdated" label.
 */
export function useReviewHighlights(
  containerRef: RefObject<HTMLDivElement | null>,
  comments: ReviewComment[],
  previousSnapshot: ReviewSnapshot | null,
  currentContent: string | null,
  onDeleteComment: (id: string) => void,
  onResolveComment: (id: string) => void,
  onEditComment: (id: string, newComment: string) => void,
  /** e.g. "1/3" when viewing a past snapshot, null when live */
  snapshotLabel?: string | null,
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
    const resolved = comments.filter((c) => c.resolved);

    // Show collapsed resolved-comment indicator if any exist
    if (resolved.length > 0) {
      insertResolvedIndicator(el, resolved.length);
    }

    if (active.length === 0) return;

    // Precompute the normalized rendered text for the "is this text still
    // present?" fallback check.  We use `innerText` (not `textContent`)
    // because it reflects what the browser would copy to the clipboard —
    // including newlines at block boundaries — which matches what
    // `selection.toString()` captured when the comment was originally made.
    // `textContent` just concatenates text nodes with no separators and
    // misses cross-block selections entirely.
    const renderedText = (el as HTMLElement).innerText || el.textContent || "";
    const normalizedRendered = renderedText.replace(/\s+/g, " ").trim();

    // For each comment: highlight the text, then insert an inline comment block
    // after the containing block-level element.
    for (const comment of active) {
      const mark = highlightText(el, comment.selected_text, comment.id);
      if (mark) {
        // Text still present and locatable — show normal inline comment
        insertInlineComment(
          el,
          mark,
          comment,
          onDeleteComment,
          onResolveComment,
          onEditComment,
          false,
        );
        continue;
      }

      // `highlightText` couldn't pin the text down.  Distinguish between
      // genuinely outdated (text gone from the document) and merely
      // unlocatable (text still present, but we couldn't match a Range
      // across inline-formatting or block boundaries).
      const normalizedSelection = comment.selected_text
        .replace(/\s+/g, " ")
        .trim();
      const stillPresent =
        normalizedSelection.length > 0 &&
        normalizedRendered.includes(normalizedSelection);

      insertCommentAtBestBlock(
        el,
        comment,
        onDeleteComment,
        onResolveComment,
        onEditComment,
        /* isOutdated */ !stillPresent,
      );
    }
  }, [
    containerRef,
    comments,
    currentContent,
    onDeleteComment,
    onResolveComment,
    onEditComment,
  ]);

  // --- Block-level change highlights ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clean previous block highlights, revision badges, and addressed badges
    el.querySelectorAll(`[${BLOCK_ATTR}]`).forEach((node) => {
      (node as HTMLElement).removeAttribute(BLOCK_ATTR);
      (node as HTMLElement).classList.remove(
        "review-changed-block",
        "review-addressed-block",
      );
    });
    el.querySelectorAll(".review-revision-badge").forEach((n) => n.remove());
    el.querySelectorAll(".review-addressed-badge").forEach((n) => n.remove());

    if (!previousSnapshot || !currentContent) return;

    const oldBlocks = splitBlocks(previousSnapshot.content);
    const newBlocks = splitBlocks(currentContent);
    const changedTexts = findChangedBlocks(oldBlocks, newBlocks);

    if (changedTexts.size === 0) return;

    // Build a set of resolved comments' selected text (normalized) for
    // the "addressed" connection — if a changed block overlaps with a
    // resolved comment's text, it likely addressed that comment.
    const resolved = comments.filter((c) => c.resolved);
    const resolvedTexts = resolved.map((c) =>
      c.selected_text.replace(/\s+/g, " ").trim().toLowerCase(),
    );

    const blockEls = el.querySelectorAll(
      "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table",
    );
    for (const blockEl of blockEls) {
      const blockText = (blockEl.textContent || "").trim();
      if (changedTexts.has(blockText)) {
        (blockEl as HTMLElement).setAttribute(BLOCK_ATTR, "true");
        (blockEl as HTMLElement).classList.add("review-changed-block");

        // Check if this changed block addressed a resolved comment.
        // We check: did any old block that CHANGED contain a resolved
        // comment's selected text? If so, this new block "addressed" it.
        const oldBlocksForPos = findOldBlocksForChanged(
          oldBlocks,
          newBlocks,
          blockText,
        );
        const addressed = resolvedTexts.some((rt: string) =>
          oldBlocksForPos.some(
            (ob: string) =>
              ob.toLowerCase().includes(rt) || rt.includes(ob.toLowerCase()),
          ),
        );

        if (addressed) {
          (blockEl as HTMLElement).classList.add("review-addressed-block");
          const badge = document.createElement("span");
          badge.className = "review-addressed-badge";
          badge.textContent = "\u2713 addressed";
          (blockEl as HTMLElement).style.position = "relative";
          blockEl.insertBefore(badge, blockEl.firstChild);
        } else if (snapshotLabel) {
          // Add revision badge if viewing a past snapshot
          const badge = document.createElement("span");
          badge.className = "review-revision-badge";
          badge.textContent = snapshotLabel;
          (blockEl as HTMLElement).style.position = "relative";
          blockEl.insertBefore(badge, blockEl.firstChild);
        }
      }
    }
  }, [containerRef, previousSnapshot, currentContent, snapshotLabel, comments]);
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
  onEdit: (id: string, newComment: string) => void,
  isOutdated: boolean,
) {
  const blockEl = findBlockAncestor(container, anchorEl);
  if (!blockEl) return;

  const wrapper = createCommentBlock(
    comment,
    onDelete,
    onResolve,
    onEdit,
    isOutdated,
  );

  // Insert after the block element
  if (blockEl.nextSibling) {
    blockEl.parentNode!.insertBefore(wrapper, blockEl.nextSibling);
  } else {
    blockEl.parentNode!.appendChild(wrapper);
  }
}

/**
 * Insert a comment near the best-matching block in the container.  Used
 * when `highlightText` couldn't pin the selection down to a precise DOM
 * range.  Uses word overlap to find the most similar paragraph to where
 * the comment originally lived.
 *
 * Pass `isOutdated=true` if the text has genuinely been removed from the
 * document (shows the "Outdated" badge + Dismiss button); pass `false` if
 * the text is still present but we just couldn't match a precise Range
 * (renders as a normal inline comment at the best block).
 */
function insertCommentAtBestBlock(
  container: HTMLElement,
  comment: ReviewComment,
  onDelete: (id: string) => void,
  onResolve: (id: string) => void,
  onEdit: (id: string, newComment: string) => void,
  isOutdated: boolean,
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

  const wrapper = createCommentBlock(
    comment,
    onDelete,
    onResolve,
    onEdit,
    isOutdated,
  );

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
  onEdit: (id: string, newComment: string) => void,
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
          <button class="review-inline-comment-edit" title="Edit comment">&#x270E;</button>
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
        <span class="review-inline-comment-icon" title="Review comment">&#x1f4ac;</span>
        <div class="review-inline-comment-text"></div>
        <button class="review-inline-comment-edit" title="Edit comment">&#x270E;</button>
        <button class="review-inline-comment-delete" title="Delete comment">&times;</button>
      </div>
    `;
  }

  // Set comment text safely (no innerHTML for user content)
  const textEl = wrapper.querySelector(".review-inline-comment-text");
  if (textEl) textEl.textContent = comment.comment;

  // Wire up edit button — replaces text with a textarea inline
  const editBtn = wrapper.querySelector(".review-inline-comment-edit");
  if (editBtn && textEl) {
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Already editing?
      if (wrapper.querySelector(".review-inline-edit-area")) return;

      const currentText = comment.comment;
      const textarea = document.createElement("textarea");
      textarea.className = "review-inline-edit-area";
      textarea.value = currentText;
      textarea.rows = 3;

      const btnRow = document.createElement("div");
      btnRow.className = "review-inline-edit-buttons";

      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Save";
      saveBtn.className = "review-inline-edit-save";

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.className = "review-inline-edit-cancel";

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(saveBtn);

      // Hide existing text, show editor
      (textEl as HTMLElement).style.display = "none";
      textEl.parentNode!.insertBefore(textarea, textEl.nextSibling);
      textEl.parentNode!.insertBefore(btnRow, textarea.nextSibling);
      textarea.focus();

      const cleanup = () => {
        textarea.remove();
        btnRow.remove();
        (textEl as HTMLElement).style.display = "";
      };

      saveBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const newText = textarea.value.trim();
        if (newText && newText !== currentText) {
          onEdit(comment.id, newText);
        }
        cleanup();
      });

      cancelBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cleanup();
      });

      textarea.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
          ev.preventDefault();
          saveBtn.click();
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          cancelBtn.click();
        }
      });
    });
  }

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

/** Insert a collapsed indicator showing how many resolved comments are hidden. */
function insertResolvedIndicator(container: HTMLElement, count: number) {
  const existing = container.querySelector(".review-resolved-indicator");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.className = "review-resolved-indicator";
  bar.setAttribute(INLINE_COMMENT_ATTR, "__resolved__");
  bar.innerHTML = `
    <span class="review-resolved-indicator-icon">\u2713</span>
    <span class="review-resolved-indicator-text">${count} resolved comment${count !== 1 ? "s" : ""}</span>
  `;

  // Insert at the top of the container
  if (container.firstChild) {
    container.insertBefore(bar, container.firstChild);
  } else {
    container.appendChild(bar);
  }
}

/**
 * Find old blocks that correspond to a changed new block, by matching
 * position in the block diff.  Returns the stripped old block texts.
 */
function findOldBlocksForChanged(
  oldBlocks: string[],
  newBlocks: string[],
  newBlockText: string,
): string[] {
  const results: string[] = [];
  const maxLen = Math.max(oldBlocks.length, newBlocks.length);
  for (let i = 0; i < maxLen; i++) {
    const oldB = oldBlocks[i] || "";
    const newB = newBlocks[i] || "";
    if (oldB !== newB && newB && stripMarkdown(newB) === newBlockText) {
      results.push(stripMarkdown(oldB));
    }
  }
  return results;
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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text nodes inside existing inline comments to avoid false matches
      const parent = node.parentElement;
      if (parent?.closest(`[${INLINE_COMMENT_ATTR}]`)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  // Try exact match first, then whitespace-normalized match
  const result = tryHighlight(textNodes, text, commentId);
  if (result) return result;

  // Fallback: normalize whitespace in both the search text and accumulated content
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (normalizedText !== text) {
    return tryHighlightNormalized(textNodes, normalizedText, commentId);
  }

  return null;
}

/** Try exact text match across text nodes and wrap in <mark>. */
function tryHighlight(
  textNodes: Text[],
  text: string,
  commentId: string,
): HTMLElement | null {
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

/**
 * Whitespace-normalized match: collapse runs of whitespace in both the
 * accumulated DOM text and the search text, then map matched positions
 * back to original offsets for highlighting.
 */
function tryHighlightNormalized(
  textNodes: Text[],
  normalizedText: string,
  commentId: string,
): HTMLElement | null {
  // Build a map from normalized-index to original-index
  let raw = "";
  for (const tn of textNodes) {
    raw += tn.textContent || "";
  }
  const normalized: string[] = [];
  const normToRaw: number[] = [];
  let inSpace = false;
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) {
      if (!inSpace && normalized.length > 0) {
        normalized.push(" ");
        normToRaw.push(i);
        inSpace = true;
      }
    } else {
      normalized.push(raw[i]);
      normToRaw.push(i);
      inSpace = false;
    }
  }
  const normStr = normalized.join("");
  const pos = normStr.indexOf(normalizedText);
  if (pos === -1) return null;

  // Map back to raw positions
  const rawStart = normToRaw[pos];
  const rawEnd = normToRaw[pos + normalizedText.length - 1] + 1;

  // Now highlight the raw range
  let offset = 0;
  let firstMark: HTMLElement | null = null;
  for (const tn of textNodes) {
    const nodeText = tn.textContent || "";
    const nodeStart = offset;
    const nodeEnd = offset + nodeText.length;

    const matchStart = Math.max(rawStart, nodeStart) - nodeStart;
    const matchEnd = Math.min(rawEnd, nodeEnd) - nodeStart;

    if (matchEnd > matchStart) {
      const range = document.createRange();
      range.setStart(tn, matchStart);
      range.setEnd(tn, matchEnd);

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
