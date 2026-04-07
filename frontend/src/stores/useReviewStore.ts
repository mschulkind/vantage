import { create } from "zustand";
import axios from "axios";
import { useRepoStore } from "./useRepoStore";
import type { ReviewComment, ReviewData, ReviewSnapshot } from "../types";

const getApiBase = (): string | null => {
  const { currentRepo, isMultiRepo } = useRepoStore.getState();
  if (isMultiRepo) {
    if (!currentRepo) return null;
    return `/api/r/${encodeURIComponent(currentRepo)}`;
  }
  return "/api";
};

interface PendingSelection {
  text: string;
  rect: DOMRect;
}

interface ReviewState {
  // Mode
  isReviewMode: boolean;
  toggleReviewMode: () => void;

  // Current file
  filePath: string | null;
  lastContent: string | null;

  // Comments
  comments: ReviewComment[];
  pendingSelection: PendingSelection | null;

  // Snapshots
  snapshots: ReviewSnapshot[];
  currentSnapshotIndex: number | null; // null = viewing live file

  // Loading
  isLoading: boolean;

  // Actions
  loadReview: (filePath: string) => Promise<void>;
  saveReview: () => Promise<void>;
  setPendingSelection: (text: string, rect: DOMRect) => void;
  clearPendingSelection: () => void;
  addComment: (selectedText: string, comment: string) => void;
  deleteComment: (id: string) => void;
  resolveComment: (id: string) => void;
  clearAllComments: () => void;
  addSnapshot: (content: string) => void;
  setSnapshotIndex: (index: number | null) => void;
  setLastContent: (content: string) => void;
  copyAllToClipboard: () => Promise<boolean>;
  deleteReview: () => Promise<void>;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  isReviewMode: false,
  filePath: null,
  lastContent: null,
  comments: [],
  pendingSelection: null,
  snapshots: [],
  currentSnapshotIndex: null,
  isLoading: false,

  toggleReviewMode: () => {
    set((s) => ({
      isReviewMode: !s.isReviewMode,
      pendingSelection: null,
    }));
  },

  loadReview: async (filePath: string) => {
    const base = getApiBase();
    if (!base) return;

    if (get().filePath !== filePath) {
      set({
        filePath,
        comments: [],
        snapshots: [],
        pendingSelection: null,
        currentSnapshotIndex: null,
      });
    }

    set({ isLoading: true });
    try {
      const { data } = await axios.get<ReviewData | null>(`${base}/review`, {
        params: { path: filePath },
      });
      if (data) {
        set({
          comments: data.comments,
          snapshots: data.snapshots,
          filePath: data.file_path,
        });
      }
    } catch {
      // No review data yet
    } finally {
      set({ isLoading: false });
    }
  },

  saveReview: async () => {
    const { filePath, comments, snapshots } = get();
    const base = getApiBase();
    if (!base || !filePath) return;

    const data: ReviewData = { file_path: filePath, snapshots, comments };
    try {
      await axios.put(`${base}/review`, data, {
        params: { path: filePath },
      });
    } catch (e) {
      console.error("Failed to save review", e);
    }
  },

  setPendingSelection: (text: string, rect: DOMRect) => {
    set({ pendingSelection: { text, rect } });
  },

  clearPendingSelection: () => {
    set({ pendingSelection: null });
  },

  addComment: (selectedText: string, comment: string) => {
    const newComment: ReviewComment = {
      id: crypto.randomUUID(),
      selected_text: selectedText,
      comment,
      created_at: Date.now() / 1000,
    };
    set((s) => ({
      comments: [...s.comments, newComment],
      pendingSelection: null,
    }));
    get().saveReview();
  },

  deleteComment: (id: string) => {
    set((s) => ({
      comments: s.comments.filter((c) => c.id !== id),
    }));
    get().saveReview();
  },

  resolveComment: (id: string) => {
    set((s) => ({
      comments: s.comments.map((c) =>
        c.id === id ? { ...c, resolved: true } : c,
      ),
    }));
    get().saveReview();
  },

  clearAllComments: () => {
    set({ comments: [] });
    get().saveReview();
  },

  addSnapshot: (content: string) => {
    const snap: ReviewSnapshot = {
      id: crypto.randomUUID(),
      content,
      timestamp: Date.now() / 1000,
    };
    set((s) => ({ snapshots: [...s.snapshots, snap] }));
    get().saveReview();
  },

  setSnapshotIndex: (index: number | null) => {
    set({ currentSnapshotIndex: index, pendingSelection: null });
  },

  setLastContent: (content: string) => {
    set({ lastContent: content });
  },

  copyAllToClipboard: async () => {
    const { filePath, lastContent, comments } = get();
    const active = comments.filter((c) => !c.resolved);
    if (!filePath || active.length === 0) return false;

    const contentLines = (lastContent || "").split("\n");
    const CONTEXT = 2; // lines of context before/after selection

    const output = [`## Review Comments for \`${filePath}\``, ""];
    for (const c of active) {
      // Find the selected text in the file to get line numbers
      const loc = findTextLocation(contentLines, c.selected_text);
      if (loc) {
        const { startLine, endLine } = loc;
        // Show context: a few lines before and after the selection
        const ctxStart = Math.max(0, startLine - CONTEXT);
        const ctxEnd = Math.min(contentLines.length - 1, endLine + CONTEXT);
        const label =
          startLine === endLine
            ? `Line ${startLine + 1}`
            : `Lines ${startLine + 1}-${endLine + 1}`;
        output.push(`### ${label}`);
        output.push("");
        output.push("```");
        for (let i = ctxStart; i <= ctxEnd; i++) {
          const marker = i >= startLine && i <= endLine ? ">" : " ";
          output.push(
            `${marker} ${String(i + 1).padStart(4)} | ${contentLines[i]}`,
          );
        }
        output.push("```");
      } else {
        // Fallback: just quote the selected text
        output.push(`> ${c.selected_text.replace(/\n/g, "\n> ")}`);
      }
      output.push("");
      output.push(`**Comment:** ${c.comment}`);
      output.push("");
      output.push("---");
      output.push("");
    }

    try {
      await navigator.clipboard.writeText(output.join("\n"));
      return true;
    } catch {
      return false;
    }
  },

  deleteReview: async () => {
    const { filePath } = get();
    const base = getApiBase();
    if (!base || !filePath) return;

    try {
      await axios.delete(`${base}/review`, { params: { path: filePath } });
    } catch {
      // ignore
    }
    set({
      comments: [],
      snapshots: [],
      currentSnapshotIndex: null,
      pendingSelection: null,
    });
  },
}));

/**
 * Find the line range of `needle` in the source lines.
 * The needle comes from rendered markdown text selection, so we normalize
 * whitespace for matching against the raw markdown source.
 */
function findTextLocation(
  lines: string[],
  needle: string,
): { startLine: number; endLine: number } | null {
  const full = lines.join("\n");
  const idx = full.indexOf(needle);
  if (idx !== -1) {
    const startLine = full.substring(0, idx).split("\n").length - 1;
    const endLine = startLine + needle.split("\n").length - 1;
    return { startLine, endLine };
  }

  // Fuzzy: normalize whitespace (rendered text collapses whitespace)
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const needleNorm = norm(needle);

  // Sliding window over lines
  for (let start = 0; start < lines.length; start++) {
    let acc = "";
    for (let end = start; end < lines.length && end < start + 50; end++) {
      acc += (end > start ? " " : "") + lines[end];
      if (norm(acc).includes(needleNorm)) {
        return { startLine: start, endLine: end };
      }
    }
  }
  return null;
}
