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
    const { filePath, comments } = get();
    const active = comments.filter((c) => !c.resolved);
    if (!filePath || active.length === 0) return false;

    const lines = [`## Review Comments for ${filePath}`, ""];
    for (const c of active) {
      lines.push(`> ${c.selected_text.replace(/\n/g, "\n> ")}`);
      lines.push("");
      lines.push(c.comment);
      lines.push("");
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
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
