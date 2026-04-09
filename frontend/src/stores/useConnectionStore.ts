import { create } from "zustand";

interface ConnectionState {
  connected: boolean;
  /** Timestamp when disconnection was first detected */
  disconnectedAt: number | null;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: true,
  disconnectedAt: null,
  setConnected: (connected) =>
    set((s) => ({
      connected,
      disconnectedAt: connected ? null : (s.disconnectedAt ?? Date.now()),
    })),
}));
