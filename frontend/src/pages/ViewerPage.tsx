import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRepoStore } from "../stores/useRepoStore";
import { useGitStore } from "../stores/useGitStore";
import { FileTree } from "../components/FileTree";
import { MarkdownViewer } from "../components/MarkdownViewer";
import { DirectoryViewer } from "../components/DirectoryViewer";
import { DiffViewer } from "../components/DiffViewer";
import { FilePicker } from "../components/FilePicker";
import { AppLink } from "../components/AppLink";
import { useWebSocket } from "../hooks/useWebSocket";
import {
  Clock,
  MessageSquare,
  GitBranch,
  ChevronRight,
  File,
  AlertCircle,
  Database,
  History,
  FileQuestion,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { RelativeTime } from "../components/RelativeTime";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "../lib/utils";
import axios from "axios";
import { SettingsDropdown } from "../components/SettingsDropdown";
import { RecentFilePopover } from "../components/RecentFilePopover";
import {
  KeyboardShortcutsModal,
  KeyboardShortcutsButton,
} from "../components/KeyboardShortcuts";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { RecentsModal } from "../components/RecentsModal";

export const ViewerPage: React.FC = () => {
  const {
    fileTree,
    fileContent,
    currentDirectory,
    currentPath,
    error,
    refreshTree,
    viewDirectory,
    loadFile,
    expandToPath,
    loadPathDirectories,
    repos,
    isMultiRepo,
    currentRepo,
    setCurrentRepo,
    loadRepos,
    reposLoaded,
    showEmptyDirs,
    setShowEmptyDirs,
  } = useRepoStore();

  const {
    latestCommit,
    fetchStatus,
    diff,
    showDiff,
    isDiffLoading,
    fetchDiff,
    closeDiff,
    recentFiles,
    isRecentLoading,
    fetchRecentFiles,
    repoName,
    fetchRepoInfo,
    history,
    fetchHistory,
  } = useGitStore();
  const navigate = useNavigate();
  const { "*": pathParam } = useParams();
  const contentRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef<string | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [recentsModalOpen, setRecentsModalOpen] = useState(false);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [keyboardShortcutsEnabled, setKeyboardShortcutsEnabled] =
    useState<boolean>(() => {
      try {
        return localStorage.getItem("vantage:shortcuts-enabled") !== "false";
      } catch {
        return true;
      }
    });
  const { isLoading } = useRepoStore();
  const recentlyChangedPaths = useRepoStore((s) => s.recentlyChangedPaths);

  useWebSocket();

  // Helper to get API base
  const getApiBase = useCallback((): string => {
    const { currentRepo: cr, isMultiRepo: imr } = useRepoStore.getState();
    if (imr && cr) return `/api/r/${encodeURIComponent(cr)}`;
    return "/api";
  }, []);

  // Build the proper URL path considering multi-repo mode
  const buildPath = useCallback(
    (filePath: string): string => {
      if (isMultiRepo && currentRepo) {
        return `/${currentRepo}/${filePath}`;
      }
      return `/${filePath}`;
    },
    [isMultiRepo, currentRepo],
  );

  // File picker select handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea, or if modifier keys are held
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "t") return;

      e.preventDefault();

      const {
        isMultiRepo: imr,
        currentRepo: cr,
        reposLoaded: rl,
      } = useRepoStore.getState();
      if (!rl) return;

      // In multi-repo mode, require a repo to be selected
      if (imr && !cr) {
        useRepoStore.setState({
          error: "Select a repository first before searching files.",
        });
        return;
      }

      // Fetch file list if not already loaded, then open picker
      const apiBase = getApiBase();
      if (allFiles.length === 0) {
        axios.get<string[]>(`${apiBase}/files`).then((res) => {
          setAllFiles(res.data);
          setFilePickerOpen(true);
        });
      } else {
        setFilePickerOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [allFiles, getApiBase]);

  // Clear cached file list when repo changes
  useEffect(() => {
    setAllFiles([]); // eslint-disable-line react-hooks/set-state-in-effect
  }, [currentRepo]);

  // Load repos on mount
  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  // Load initial tree structure (after repos are loaded, only for single-repo mode)
  useEffect(() => {
    if (!reposLoaded) return; // Wait for repos to be loaded first
    if (!isMultiRepo) {
      refreshTree();
    }
  }, [refreshTree, isMultiRepo, reposLoaded]);

  // Handle URL changes - parse repo and path from URL
  useEffect(() => {
    if (!reposLoaded) return; // Wait for repos to be loaded first

    const fullPath = pathParam || "";

    // Sanitize: reject path traversal attempts
    const sanitizePath = (p: string): string | null => {
      if (p.startsWith("/") || p.includes("..") || p.includes("\0"))
        return null;
      return p;
    };

    if (isMultiRepo) {
      // In multi-repo mode, the first segment is the repo name
      const segments = fullPath.split("/").filter(Boolean);

      if (segments.length === 0) {
        // Root URL in multi-repo mode - show repo selector
        if (currentRepo) {
          setCurrentRepo(null);
        }
        return;
      }

      const repoName = segments[0];
      const rawFilePath = segments.slice(1).join("/") || ".";
      const filePath = sanitizePath(rawFilePath) ?? ".";

      // Check if this repo exists
      const repoExists = repos.some((r) => r.name === repoName);
      if (!repoExists) {
        // Repo not found - set error and clear content
        useRepoStore.setState({
          error: `Repository not found: ${repoName}`,
          fileContent: null,
          currentDirectory: null,
          currentPath: fullPath,
          fileTree: [],
        });
        return;
      }

      // Set the current repo if different
      if (currentRepo !== repoName) {
        setCurrentRepo(repoName);
        return; // Let the state update trigger a re-render
      }

      // Clear any previous errors and load the file/directory
      useRepoStore.setState({ error: null });

      if (filePath !== ".") {
        expandToPath(filePath);
        loadPathDirectories(filePath);
      }

      if (filePath.toLowerCase().endsWith(".md")) {
        loadFile(filePath);
      } else {
        viewDirectory(filePath);
      }
    } else {
      // Single-repo mode - path is the file path directly
      const rawPath = fullPath || ".";
      const path = sanitizePath(rawPath) ?? ".";

      // Clear any previous errors on path change
      useRepoStore.setState({ error: null });

      if (path !== ".") {
        expandToPath(path);
        loadPathDirectories(path);
      }

      if (path.toLowerCase().endsWith(".md")) {
        loadFile(path);
      } else {
        viewDirectory(path);
      }
    }
  }, [
    pathParam,
    loadFile,
    viewDirectory,
    expandToPath,
    loadPathDirectories,
    isMultiRepo,
    currentRepo,
    repos,
    setCurrentRepo,
    reposLoaded,
  ]);

  useEffect(() => {
    if (currentPath) {
      fetchStatus(currentPath);
    }
  }, [currentPath, fetchStatus]);

  // Scroll to top when navigating to a new file, or to anchor if hash is present.
  // When the *same* file updates (live reload), preserve scroll position.
  useEffect(() => {
    if (!fileContent || !contentRef.current) return;

    const isSameFile = prevPathRef.current === fileContent.path;
    prevPathRef.current = fileContent.path;

    if (isSameFile) {
      // Same file updated – keep current scroll position.
      // The DOM will re-render in place; the browser preserves scrollTop
      // automatically for the container, but we capture/restore to be safe
      // against layout shifts from content-length changes.
      const container = contentRef.current;
      const savedTop = container.scrollTop;
      const savedHeight = container.scrollHeight;
      requestAnimationFrame(() => {
        if (!container) return;
        const newHeight = container.scrollHeight;
        if (newHeight !== savedHeight) {
          // Content height changed – keep relative position
          const ratio = savedHeight > 0 ? savedTop / savedHeight : 0;
          container.scrollTop = ratio * newHeight;
        }
        // If height didn't change, scrollTop is already correct
      });
      return;
    }

    // Navigated to a different file
    const hash = window.location.hash.slice(1);
    if (hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el && contentRef.current?.scrollTo) {
          const offset =
            el.getBoundingClientRect().top -
            contentRef.current.getBoundingClientRect().top +
            contentRef.current.scrollTop;
          contentRef.current.scrollTo({ top: offset - 16 });
        }
      });
    } else if (contentRef.current.scrollTo) {
      contentRef.current.scrollTo(0, 0);
    }
  }, [fileContent]);

  // Fetch recent files and repo info when repo is set (or on mount for single-repo)
  useEffect(() => {
    if (!reposLoaded) return;
    if (isMultiRepo && !currentRepo) return;
    fetchRecentFiles();
    fetchRepoInfo();
  }, [fetchRecentFiles, fetchRepoInfo, reposLoaded, isMultiRepo, currentRepo]);

  // Fetch file history when viewing a file
  useEffect(() => {
    if (currentPath && currentPath.toLowerCase().endsWith(".md")) {
      fetchHistory(currentPath);
    }
  }, [currentPath, fetchHistory]);

  // Dynamic page title
  useEffect(() => {
    if (repoName) {
      document.title = `Vantage: ${repoName}`;
    } else {
      document.title = "Vantage";
    }
    return () => {
      document.title = "Vantage";
    };
  }, [repoName]);

  const handleCommitClick = () => {
    if (latestCommit && currentPath) {
      fetchDiff(currentPath, latestCommit.hexsha);
    }
  };

  // File picker select handler
  const handleFilePickerSelect = useCallback(
    (path: string) => {
      navigate(buildPath(path));
    },
    [navigate, buildPath],
  );

  // Keyboard shortcuts
  const handleOpenFilePicker = useCallback(() => {
    setFilePickerOpen(true);
  }, []);
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);
  const handleShortcutNavigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );
  const handleViewDiff = useCallback(() => {
    if (latestCommit && currentPath) {
      fetchDiff(currentPath, latestCommit.hexsha);
    }
  }, [latestCommit, currentPath, fetchDiff]);
  const handleViewHistory = useCallback(() => {
    if (
      currentPath &&
      currentPath.toLowerCase().endsWith(".md") &&
      history.length > 0
    ) {
      const historyPath =
        isMultiRepo && currentRepo
          ? `/history/${currentRepo}/${currentPath}`
          : `/history/${currentPath}`;
      navigate(historyPath);
    }
  }, [currentPath, history, isMultiRepo, currentRepo, navigate]);
  const { shortcutsOpen, setShortcutsOpen } = useKeyboardShortcuts({
    onOpenFilePicker: handleOpenFilePicker,
    onToggleSidebar: handleToggleSidebar,
    onNavigate: handleShortcutNavigate,
    onViewDiff: handleViewDiff,
    onViewHistory: handleViewHistory,
    contentScrollRef: contentRef,
    isMultiRepo,
    currentRepo,
    enabled: keyboardShortcutsEnabled,
  });

  // 't' hotkey for file picker
  useEffect(() => {
    try {
      localStorage.setItem(
        "vantage:shortcuts-enabled",
        keyboardShortcutsEnabled ? "true" : "false",
      );
    } catch {
      // ignore
    }
  }, [keyboardShortcutsEnabled]);

  useEffect(() => {
    if (!keyboardShortcutsEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea, or if modifier keys are held
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "t") return;

      e.preventDefault();

      const {
        isMultiRepo: imr,
        currentRepo: cr,
        reposLoaded: rl,
      } = useRepoStore.getState();
      if (!rl) return;

      // In multi-repo mode, require a repo to be selected
      if (imr && !cr) {
        useRepoStore.setState({
          error: "Select a repository first before searching files.",
        });
        return;
      }

      // Fetch file list if not already loaded, then open picker
      const apiBase = getApiBase();
      if (allFiles.length === 0) {
        axios.get<string[]>(`${apiBase}/files`).then((res) => {
          setAllFiles(res.data);
          setFilePickerOpen(true);
        });
      } else {
        setFilePickerOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [allFiles, getApiBase, keyboardShortcutsEnabled]);

  // Clear cached file list when repo changes
  useEffect(() => {
    setAllFiles([]); // eslint-disable-line react-hooks/set-state-in-effect
  }, [currentRepo]);

  // Load repos on mount
  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  useWebSocket();

  // Close sidebar on mobile when navigating to a new path
  useEffect(() => {
    setSidebarOpen(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, [pathParam]);

  const breadcrumbs =
    currentPath && currentPath !== "." ? currentPath.split("/") : [];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden text-slate-900 dark:text-slate-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "w-72 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800 shadow-sm",
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <GitBranch size={18} className="text-white" />
            </div>
            <AppLink
              to="/"
              className="font-semibold text-lg tracking-tight hover:text-blue-600 transition-colors no-underline text-inherit dark:text-slate-100"
              onBeforeNavigate={() => {
                if (isMultiRepo) setCurrentRepo(null);
              }}
            >
              Vantage
            </AppLink>
          </div>
          <div className="flex items-center gap-1">
            <KeyboardShortcutsButton onClick={() => setShortcutsOpen(true)} />
            <SettingsDropdown
              showEmptyDirs={showEmptyDirs}
              onShowEmptyDirsChange={setShowEmptyDirs}
              keyboardShortcutsEnabled={keyboardShortcutsEnabled}
              onKeyboardShortcutsEnabledChange={setKeyboardShortcutsEnabled}
            />
            <button
              className="md:hidden p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {/* Multi-repo mode: show repo list or file tree */}
          {isMultiRepo && !currentRepo ? (
            <div className="space-y-1">
              {repos.map((repo) => (
                <AppLink
                  key={repo.name}
                  to={`/${repo.name}`}
                  onBeforeNavigate={() => {
                    setCurrentRepo(repo.name);
                  }}
                  className={cn(
                    "flex items-center py-2 px-3 rounded-md text-sm transition-all duration-150 no-underline",
                    "hover:bg-slate-100 dark:hover:bg-slate-700",
                  )}
                >
                  <Database size={16} className="mr-2 text-blue-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {repo.name}
                  </span>
                </AppLink>
              ))}
            </div>
          ) : (
            <>
              {/* Show current repo name with back button in multi-repo mode */}
              {isMultiRepo && currentRepo && (
                <AppLink
                  to="/"
                  onBeforeNavigate={() => {
                    setCurrentRepo(null);
                  }}
                  className="flex items-center py-2 px-2 mb-2 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border-b border-slate-100 dark:border-slate-700 no-underline"
                >
                  <ChevronRight size={12} className="mr-1 rotate-180" />
                  <Database size={12} className="mr-1" />
                  <span className="font-medium">{currentRepo}</span>
                </AppLink>
              )}
              <FileTree nodes={fileTree} />
            </>
          )}
        </div>
        {/* Recent Files Section - always visible, with spinner when loading */}
        {(!isMultiRepo || currentRepo) && (
          <div className="border-t border-slate-200 dark:border-slate-700 px-2 py-2 shrink-0">
            <button
              onClick={() => setRecentsModalOpen(true)}
              className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors w-full"
            >
              <Clock size={12} />
              <span>Recent</span>
              {isRecentLoading && (
                <Loader2 size={10} className="animate-spin text-slate-400" />
              )}
            </button>
            <div className="space-y-0.5 overflow-y-auto h-40">
              {isRecentLoading && recentFiles.length === 0 ? (
                <div className="flex flex-col space-y-2 px-2 py-1">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center space-x-2 animate-pulse"
                    >
                      <div className="w-3 h-3 bg-slate-200 rounded shrink-0" />
                      <div className="h-3 bg-slate-200 rounded flex-1" />
                    </div>
                  ))}
                </div>
              ) : (
                recentFiles.map((file) => {
                  const parts = file.path.split("/");
                  const fileName = parts.pop() || "";
                  const parentDir = parts.length > 0 ? parts.join("/") : "";
                  return (
                    <RecentFilePopover key={file.path} file={file}>
                      <AppLink
                        to={buildPath(file.path)}
                        className={cn(
                          "w-full flex items-start py-1.5 px-2 text-left rounded-md text-xs transition-all duration-150 no-underline",
                          "hover:bg-slate-100 dark:hover:bg-slate-700",
                          currentPath === file.path &&
                            "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
                          recentlyChangedPaths.has(file.path) &&
                            "animate-flash-update",
                        )}
                      >
                        <File
                          size={13}
                          className={cn(
                            "mr-1.5 mt-0.5 shrink-0",
                            file.untracked ? "text-amber-400" : "text-slate-400",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                              {fileName}
                            </span>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                              <RelativeTime date={file.date} addSuffix={false} />
                            </span>
                          </div>
                          {parentDir && (
                            <div className="truncate text-slate-400">
                              {parentDir}/
                            </div>
                          )}
                        </div>
                      </AppLink>
                    </RecentFilePopover>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900 min-w-0">
        {/* Header / Breadcrumbs */}
        <div className="h-14 border-b border-slate-200 dark:border-slate-700 flex items-center px-3 md:px-6 justify-between shrink-0 bg-white dark:bg-slate-800 gap-2">
          <div className="flex items-center min-w-0 gap-2">
            <button
              className="md:hidden p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 shrink-0"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <nav className="flex items-center text-sm space-x-1 min-w-0 overflow-hidden">
              <AppLink
                to={isMultiRepo && currentRepo ? `/${currentRepo}` : "/"}
                className="text-slate-500 hover:text-blue-600 font-medium transition-colors shrink-0 no-underline"
              >
                {isMultiRepo && currentRepo ? currentRepo : "root"}
              </AppLink>
              {breadcrumbs.map((part, i) => (
                <React.Fragment key={i}>
                  <ChevronRight size={14} className="text-slate-300 shrink-0" />
                  {i < breadcrumbs.length - 1 ? (
                    <AppLink
                      to={buildPath(
                        currentPath
                          ?.split("/")
                          .slice(0, i + 1)
                          .join("/") || ".",
                      )}
                      className="text-slate-500 hover:text-blue-600 transition-colors no-underline hidden sm:inline"
                    >
                      {part}
                    </AppLink>
                  ) : (
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {part}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          {latestCommit ? (
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={handleCommitClick}
                className="hidden sm:flex items-center space-x-3 text-xs group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                title="Click to view diff"
              >
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
                  <Clock size={14} />
                  <span>
                    <RelativeTime date={latestCommit.date} />
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-700 group-hover:bg-slate-200 dark:group-hover:bg-slate-600 px-2.5 py-1.5 rounded-md transition-colors">
                  <MessageSquare size={12} className="text-slate-400" />
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                    {latestCommit.message}
                  </span>
                </div>
              </button>
              {/* Mobile: just show clock icon as commit button */}
              <button
                onClick={handleCommitClick}
                className="sm:hidden flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg px-2 py-1.5 transition-colors"
                title="View diff"
              >
                <Clock size={14} />
                <span><RelativeTime date={latestCommit.date} addSuffix={false} /></span>
              </button>
              {currentPath &&
                currentPath.toLowerCase().endsWith(".md") &&
                history.length > 1 && (
                  <AppLink
                    to={
                      isMultiRepo && currentRepo
                        ? `/history/${currentRepo}/${currentPath}`
                        : `/history/${currentPath}`
                    }
                    className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg px-2 py-1.5 transition-colors no-underline"
                    title="View full history"
                  >
                    <History size={14} />
                    <span className="hidden sm:inline">
                      {history.length} commits
                    </span>
                  </AppLink>
                )}
            </div>
          ) : currentPath && currentPath.toLowerCase().endsWith(".md") ? (
            <div className="flex items-center space-x-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 sm:px-3 py-1.5 rounded-lg shrink-0">
              <FileQuestion size={14} />
              <span className="font-medium hidden sm:inline">
                Untracked file
              </span>
            </div>
          ) : null}
        </div>

        {/* Viewer */}
        <div
          ref={contentRef}
          data-content-scroll
          className="flex-1 overflow-y-auto bg-white dark:bg-slate-900"
        >
          <div className="max-w-5xl mx-auto py-4 px-4 sm:py-6 sm:px-8">
            {error ? (
              <div className="flex flex-col items-center justify-center h-64 text-red-500">
                <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                  <AlertCircle size={32} className="text-red-400" />
                </div>
                <p className="text-lg font-medium text-red-600">{error}</p>
                {currentPath && (
                  <p className="text-sm text-red-400 mt-1 font-mono">
                    {currentPath}
                  </p>
                )}
                <AppLink
                  to="/"
                  className="mt-4 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors no-underline inline-block"
                >
                  Go to Home
                </AppLink>
              </div>
            ) : isLoading && !fileContent && !currentDirectory ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Loader2
                  size={32}
                  className="animate-spin text-blue-500 mb-4"
                />
                <p className="text-sm text-slate-500">Loading...</p>
              </div>
            ) : fileContent ? (
              fileContent.encoding === "binary" ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800">
                  <File size={48} className="mb-3 text-slate-300" />
                  <p className="text-sm">
                    Binary file content cannot be displayed.
                  </p>
                </div>
              ) : (
              <div className="pb-8">
                  <MarkdownViewer
                    content={fileContent.content}
                    currentPath={fileContent.path}
                  />
                </div>
              )
            ) : currentDirectory ? (
              <DirectoryViewer
                nodes={currentDirectory}
                currentPath={currentPath || "."}
              />
            ) : isMultiRepo && !currentRepo ? (
              <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-6">
                  <Database size={40} className="text-blue-500" />
                </div>
                <p className="text-xl font-semibold text-slate-600 dark:text-slate-200 mb-2">
                  Welcome to Vantage
                </p>
                <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
                  Select a repository from the sidebar to browse your Markdown
                  documentation.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {repos.map((repo) => (
                    <AppLink
                      key={repo.name}
                      to={`/${repo.name}`}
                      onBeforeNavigate={() => {
                        setCurrentRepo(repo.name);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm no-underline"
                    >
                      <Database size={16} className="text-blue-500" />
                      {repo.name}
                    </AppLink>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <GitBranch size={32} className="text-slate-300" />
                </div>
                <p className="text-lg font-medium text-slate-500">
                  Select a file or folder to browse
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Vantage supports Markdown and Mermaid diagrams
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diff Viewer Modal */}
      {showDiff &&
        (isDiffLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-8 flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-600 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-slate-600 dark:text-slate-300 font-medium">
                Loading diff...
              </p>
            </div>
          </div>
        ) : diff ? (
          <DiffViewer diff={diff} onClose={closeDiff} />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-8 flex flex-col items-center">
              <p className="text-slate-600 dark:text-slate-300 font-medium mb-4">
                Could not load diff
              </p>
              <button
                onClick={closeDiff}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      {/* File Picker */}
      <FilePicker
        isOpen={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        onSelect={handleFilePickerSelect}
        files={allFiles}
      />
      {/* Recents Modal */}
      <RecentsModal
        isOpen={recentsModalOpen}
        onClose={() => setRecentsModalOpen(false)}
      />
      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
};
