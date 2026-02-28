import { create } from "zustand";
import axios from "axios";
import { JJInfo, JJRevision, JJEvoEntry, FileDiff } from "../types";
import { useRepoStore } from "./useRepoStore";

const getApiBase = (): string | null => {
  const { currentRepo, isMultiRepo } = useRepoStore.getState();
  if (isMultiRepo) {
    if (!currentRepo) return null;
    return `/api/r/${encodeURIComponent(currentRepo)}`;
  }
  return "/api";
};

interface JJState {
  info: JJInfo | null;
  revisions: JJRevision[];
  evolog: JJEvoEntry[];
  diff: FileDiff | null;
  isLoading: boolean;
  isDiffLoading: boolean;
  showDiff: boolean;
  showEvolog: boolean;

  fetchInfo: () => Promise<void>;
  fetchLog: (path?: string, limit?: number) => Promise<void>;
  fetchEvolog: (rev?: string, limit?: number) => Promise<void>;
  fetchDiff: (rev: string, path?: string) => Promise<void>;
  setShowDiff: (show: boolean) => void;
  setShowEvolog: (show: boolean) => void;
  reset: () => void;
}

export const useJJStore = create<JJState>((set) => ({
  info: null,
  revisions: [],
  evolog: [],
  diff: null,
  isLoading: false,
  isDiffLoading: false,
  showDiff: false,
  showEvolog: false,

  fetchInfo: async () => {
    const base = getApiBase();
    if (!base) return;
    try {
      const res = await axios.get(`${base}/jj/info`);
      set({ info: res.data });
    } catch {
      set({ info: { is_jj: false, working_copy_change_id: null } });
    }
  },

  fetchLog: async (path?: string, limit = 50) => {
    const base = getApiBase();
    if (!base) return;
    set({ isLoading: true });
    try {
      const params: Record<string, string | number> = { limit };
      if (path) params.path = path;
      const res = await axios.get(`${base}/jj/log`, { params });
      set({ revisions: res.data, isLoading: false });
    } catch {
      set({ revisions: [], isLoading: false });
    }
  },

  fetchEvolog: async (rev = "@", limit = 20) => {
    const base = getApiBase();
    if (!base) return;
    set({ isLoading: true });
    try {
      const res = await axios.get(`${base}/jj/evolog`, {
        params: { rev, limit },
      });
      set({ evolog: res.data, isLoading: false });
    } catch {
      set({ evolog: [], isLoading: false });
    }
  },

  fetchDiff: async (rev: string, path?: string) => {
    const base = getApiBase();
    if (!base) return;
    set({ isDiffLoading: true });
    try {
      const params: Record<string, string> = { rev };
      if (path) params.path = path;
      const res = await axios.get(`${base}/jj/diff`, { params });
      set({ diff: res.data, isDiffLoading: false, showDiff: true });
    } catch {
      set({ diff: null, isDiffLoading: false });
    }
  },

  setShowDiff: (show) => set({ showDiff: show }),
  setShowEvolog: (show) => set({ showEvolog: show }),
  reset: () =>
    set({
      info: null,
      revisions: [],
      evolog: [],
      diff: null,
      isLoading: false,
      isDiffLoading: false,
      showDiff: false,
      showEvolog: false,
    }),
}));
