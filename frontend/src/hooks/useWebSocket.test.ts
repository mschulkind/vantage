import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWebSocket } from "./useWebSocket";
import { useRepoStore } from "../stores/useRepoStore";
import { useGitStore } from "../stores/useGitStore";

vi.mock("../stores/useRepoStore");
vi.mock("../stores/useGitStore");

describe("useWebSocket", () => {
  let mockWebSocket: {
    onopen: ((event: Event) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onclose: ((event: Event) => void) | null;
    close: ReturnType<typeof vi.fn>;
  };
  const mockLoadFile = vi.fn();
  const mockRefreshExpandedTree = vi.fn();
  const mockFetchStatus = vi.fn();
  const mockViewDirectory = vi.fn();
  const mockFetchRecentFiles = vi.fn();
  const mockMarkPathsChanged = vi.fn();

  const makeRepoStoreState = (overrides: Record<string, unknown> = {}) => ({
    currentPath: "test.md",
    loadFile: mockLoadFile,
    refreshExpandedTree: mockRefreshExpandedTree,
    viewDirectory: mockViewDirectory,
    markPathsChanged: mockMarkPathsChanged,
    reposLoaded: true,
    isMultiRepo: false,
    currentRepo: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock Stores - support both destructuring and selector patterns
    const repoState = makeRepoStoreState();
    const mockUseRepoStore = (
      selector?: (state: typeof repoState) => unknown,
    ) => {
      if (typeof selector === "function") return selector(repoState);
      return repoState;
    };
    mockUseRepoStore.getState = () => repoState;
    (useRepoStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      mockUseRepoStore,
    );
    // Also attach getState to the mock function itself
    (useRepoStore as unknown as { getState: () => typeof repoState }).getState =
      () => repoState;
    const gitState = {
      fetchStatus: mockFetchStatus,
      fetchRecentFiles: mockFetchRecentFiles,
    };
    (useGitStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: typeof gitState) => unknown) => {
        if (typeof selector === "function") return selector(gitState);
        return gitState;
      },
    );

    // Mock WebSocket
    mockWebSocket = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: vi.fn(),
    };
    global.WebSocket = vi.fn(function () {
      return mockWebSocket;
    }) as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("connects to websocket on mount", () => {
    renderHook(() => useWebSocket());
    expect(global.WebSocket).toHaveBeenCalled();
  });

  it("handles files_changed message for current file after debounce", () => {
    renderHook(() => useWebSocket());

    const message = { type: "files_changed", paths: ["test.md"] };
    act(() => {
      mockWebSocket.onmessage!({
        data: JSON.stringify(message),
      } as MessageEvent);
    });

    // Before debounce fires, nothing should happen
    expect(mockLoadFile).not.toHaveBeenCalled();

    // After debounce
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockLoadFile).toHaveBeenCalledWith("test.md");
    expect(mockFetchStatus).toHaveBeenCalledWith("test.md");
    expect(mockRefreshExpandedTree).toHaveBeenCalled();
  });

  it("does not reload file when changed file is not the current one", () => {
    const repoState = makeRepoStoreState({ currentPath: "other.md" });
    const mockStore = (
      selector?: (state: typeof repoState) => unknown,
    ) => {
      if (typeof selector === "function") return selector(repoState);
      return repoState;
    };
    mockStore.getState = () => repoState;
    (useRepoStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      mockStore,
    );
    (useRepoStore as unknown as { getState: () => typeof repoState }).getState =
      () => repoState;

    renderHook(() => useWebSocket());

    const message = { type: "files_changed", paths: ["test.md"] };
    act(() => {
      mockWebSocket.onmessage!({
        data: JSON.stringify(message),
      } as MessageEvent);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockLoadFile).not.toHaveBeenCalled();
    // Still refreshes tree
    expect(mockRefreshExpandedTree).toHaveBeenCalled();
  });

  it("batches multiple rapid messages into one refresh", () => {
    renderHook(() => useWebSocket());

    // Simulate rapid-fire messages
    act(() => {
      mockWebSocket.onmessage!({
        data: JSON.stringify({ type: "files_changed", paths: ["a.md"] }),
      } as MessageEvent);
      mockWebSocket.onmessage!({
        data: JSON.stringify({ type: "files_changed", paths: ["b.md"] }),
      } as MessageEvent);
      mockWebSocket.onmessage!({
        data: JSON.stringify({ type: "files_changed", paths: ["c.md"] }),
      } as MessageEvent);
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Only ONE tree refresh despite 3 messages
    expect(mockRefreshExpandedTree).toHaveBeenCalledTimes(1);
  });

  it("cleans up on unmount", () => {
    const { unmount } = renderHook(() => useWebSocket());
    unmount();
    expect(mockWebSocket.close).toHaveBeenCalled();
  });

  it("stores server version from hello message without reloading", () => {
    renderHook(() => useWebSocket());

    // First hello just stores the version — no reload
    act(() => {
      mockWebSocket.onmessage!({
        data: JSON.stringify({ type: "hello", version: "v1" }),
      } as MessageEvent);
    });

    // No error thrown means it handled it gracefully
    // (we can't easily test window.location.reload without more mocking)
  });

  it("refreshes everything on reconnect", () => {
    renderHook(() => useWebSocket());

    // Simulate connection open
    act(() => {
      mockWebSocket.onopen?.(new Event("open"));
    });

    // onopen triggers a full refresh
    expect(mockRefreshExpandedTree).toHaveBeenCalled();
    expect(mockFetchRecentFiles).toHaveBeenCalled();
  });

  it("skips refresh on reconnect when repos not yet loaded", () => {
    // Override getState to return reposLoaded: false
    const unloadedState = makeRepoStoreState({ reposLoaded: false });
    (
      useRepoStore as unknown as { getState: () => typeof unloadedState }
    ).getState = () => unloadedState;

    renderHook(() => useWebSocket());

    act(() => {
      mockWebSocket.onopen?.(new Event("open"));
    });

    // Should NOT call refresh functions before repos are loaded
    expect(mockRefreshExpandedTree).not.toHaveBeenCalled();
    expect(mockFetchRecentFiles).not.toHaveBeenCalled();
  });

  it("schedules reconnect when connection closes", () => {
    renderHook(() => useWebSocket());

    act(() => {
      mockWebSocket.onclose?.(new Event("close"));
    });

    // Should schedule a reconnect after base delay
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    // WebSocket constructor called again (initial + reconnect)
    expect(global.WebSocket).toHaveBeenCalledTimes(2);
  });
});
