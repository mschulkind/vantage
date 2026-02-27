import { useEffect, useRef, useCallback } from "react";
import { useRepoStore } from "../stores/useRepoStore";
import { useGitStore } from "../stores/useGitStore";
import { WebSocketMessage } from "../types";
import { isStaticMode } from "../lib/staticMode";

// Debounce window: collect all messages within this period, then process once
const DEBOUNCE_MS = 500;
// Maximum time before forced processing, even if messages keep arriving
const MAX_WAIT_MS = 2000;
// Reconnection delays
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export const useWebSocket = () => {
  // No WebSocket in static mode — there's no backend to connect to
  const staticMode = isStaticMode();

  const socketRef = useRef<WebSocket | null>(null);
  const currentPathRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPathsRef = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverVersionRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const { currentPath, loadFile, refreshExpandedTree, viewDirectory } = useRepoStore();
  const { fetchStatus, fetchRecentFiles } = useGitStore();
  const markPathsChanged = useRepoStore((s) => s.markPathsChanged);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  const processBatch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }

    const changedPaths = pendingPathsRef.current;
    if (changedPaths.size === 0 || processingRef.current) return;

    // Guard: don't fire API calls before the repo store is initialised
    const { reposLoaded, isMultiRepo, currentRepo } =
      useRepoStore.getState();
    if (!reposLoaded) return;
    if (isMultiRepo && !currentRepo) return;

    pendingPathsRef.current = new Set();
    processingRef.current = true;

    // Trigger flash animation for changed paths
    markPathsChanged(changedPaths);

    const path = currentPathRef.current;

    if (path && changedPaths.has(path)) {
      loadFile(path);
      fetchStatus(path);
    }

    if (path && !path.toLowerCase().endsWith(".md")) {
      viewDirectory(path);
    }

    refreshExpandedTree();
    fetchRecentFiles();

    setTimeout(() => {
      processingRef.current = false;
    }, DEBOUNCE_MS);
  }, [
    loadFile,
    refreshExpandedTree,
    fetchStatus,
    viewDirectory,
    fetchRecentFiles,
    markPathsChanged,
  ]);

  /** Do a full refresh after reconnecting (we may have missed changes). */
  const refreshAfterReconnect = useCallback(() => {
    // Guard: don't fire API calls before the repo store is initialised.
    // Before loadRepos() completes, isMultiRepo defaults to false and
    // getApiBase() returns "/api", which 404s in multi-repo setups.
    const { reposLoaded, isMultiRepo, currentRepo } =
      useRepoStore.getState();
    if (!reposLoaded) return;
    if (isMultiRepo && !currentRepo) return;

    const path = currentPathRef.current;
    if (path) {
      if (path.toLowerCase().endsWith(".md")) {
        loadFile(path);
        fetchStatus(path);
      } else {
        viewDirectory(path);
      }
    }
    refreshExpandedTree();
    fetchRecentFiles();
  }, [loadFile, refreshExpandedTree, fetchStatus, viewDirectory, fetchRecentFiles]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const message: WebSocketMessage = JSON.parse(event.data);

      if (message.type === "hello") {
        const version = message.version;
        if (!version) return;
        if (serverVersionRef.current === null) {
          // First connect — just record it
          serverVersionRef.current = version;
        } else if (serverVersionRef.current !== version) {
          // Server restarted with new code — force reload
          console.log("Server version changed, reloading...");
          window.location.reload();
          return;
        }
        return;
      }

      if (message.type === "files_changed" && message.paths) {
        for (const p of message.paths) {
          pendingPathsRef.current.add(p);
        }

        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(processBatch, DEBOUNCE_MS);

        if (!maxWaitTimerRef.current) {
          maxWaitTimerRef.current = setTimeout(processBatch, MAX_WAIT_MS);
        }
      }
    },
    [processBatch],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    // Clean up existing socket
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onmessage = null;
      socketRef.current.onerror = null;
      socketRef.current.onclose = null;
      if (socketRef.current.readyState <= WebSocket.OPEN) {
        socketRef.current.close();
      }
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}/api/ws`);

    socket.onopen = () => {
      console.log("WebSocket connected");
      reconnectAttemptRef.current = 0;
      // Refresh everything since we may have missed changes while disconnected
      refreshAfterReconnect();
    };

    socket.onmessage = handleMessage;

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
      socketRef.current = null;
      // Schedule a reconnect (defer via ref to avoid circular dependency)
      if (!reconnectTimerRef.current && mountedRef.current) {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, attempt),
          RECONNECT_MAX_MS,
        );
        reconnectAttemptRef.current = attempt + 1;
        console.log(
          `WebSocket reconnecting in ${delay}ms (attempt ${attempt + 1})`,
        );
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect(); // eslint-disable-line react-hooks/immutability
        }, delay);
      }
    };

    socketRef.current = socket;
  }, [handleMessage, refreshAfterReconnect]);

  // Reconnect immediately on user activity when socket is dead
  useEffect(() => {
    if (staticMode) return;
    const tryImmediateReconnect = () => {
      if (!socketRef.current || socketRef.current.readyState > WebSocket.OPEN) {
        // Cancel any pending scheduled reconnect and connect now
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        reconnectAttemptRef.current = 0;
        connect();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tryImmediateReconnect();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("mousemove", tryImmediateReconnect, {
      once: true,
      capture: true,
    });
    document.addEventListener("click", tryImmediateReconnect, {
      capture: true,
    });
    document.addEventListener("keydown", tryImmediateReconnect, {
      capture: true,
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("mousemove", tryImmediateReconnect, {
        capture: true,
      });
      document.removeEventListener("click", tryImmediateReconnect, {
        capture: true,
      });
      document.removeEventListener("keydown", tryImmediateReconnect, {
        capture: true,
      });
    };
  }, [connect, staticMode]);

  // Initial connection
  useEffect(() => {
    if (staticMode) return;
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- staticMode and connect intentionally excluded (mount once only)
};
