import React, { useEffect, useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { useGitStore } from "../stores/useGitStore";
import { useJJStore } from "../stores/useJJStore";
import { useRepoStore } from "../stores/useRepoStore";
import { AppLink } from "../components/AppLink";
import {
  GitBranch,
  ArrowLeft,
  Clock,
  User,
  MessageSquare,
  ChevronRight,
  Layers,
  Bookmark,
  Pencil,
  Camera,
  Info,
} from "lucide-react";
import { format } from "date-fns";
import { RelativeTime } from "../components/RelativeTime";
import { cn } from "../lib/utils";

type HistoryTab = "commits" | "snapshots";


export const HistoryPage: React.FC = () => {
  const { "*": pathParam } = useParams();
  const {
    history,
    fetchHistory,
    isLoading,
    fetchDiff,
    showDiff,
    diff,
    isDiffLoading,
    closeDiff,
  } = useGitStore();
  const jj = useJJStore();
  const {
    isMultiRepo,
    currentRepo,
    setCurrentRepo,
    repos,
    reposLoaded,
    loadRepos,
  } = useRepoStore();

  const [activeTab, setActiveTab] = useState<HistoryTab>("commits");
  const [expandedEvolog, setExpandedEvolog] = useState<string | null>(null);

  // Parse the file path from the URL
  const getFileInfo = useCallback(() => {
    const fullPath = pathParam || "";
    if (isMultiRepo) {
      const segments = fullPath.split("/").filter(Boolean);
      const repoName = segments[0] || "";
      const filePath = segments.slice(1).join("/") || "";
      return { repoName, filePath };
    }
    return { repoName: "", filePath: fullPath };
  }, [pathParam, isMultiRepo]);

  const { repoName, filePath } = getFileInfo();

  // Build path with repo prefix
  const buildPath = useCallback(
    (path: string): string => {
      if (isMultiRepo && currentRepo) {
        return `/${currentRepo}/${path}`;
      }
      return `/${path}`;
    },
    [isMultiRepo, currentRepo],
  );

  // Load repos on mount
  useEffect(() => {
    if (!reposLoaded) loadRepos();
  }, [loadRepos, reposLoaded]);

  // Set current repo for multi-repo mode
  useEffect(() => {
    if (isMultiRepo && repoName && repoName !== currentRepo) {
      const repoExists = repos.some((r) => r.name === repoName);
      if (repoExists) {
        setCurrentRepo(repoName);
      }
    }
  }, [isMultiRepo, repoName, currentRepo, repos, setCurrentRepo]);

  // Fetch history when we have a path
  useEffect(() => {
    if (filePath) {
      fetchHistory(filePath);
    }
  }, [filePath, fetchHistory, currentRepo]);

  // Detect jj repo on mount
  useEffect(() => {
    jj.fetchInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRepo]);

  // Fetch jj log when jj is available
  useEffect(() => {
    if (jj.info?.is_jj && filePath) {
      jj.fetchLog(filePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jj.info?.is_jj, filePath, currentRepo]);

  // Fetch jj evolog for working copy (snapshots tab)
  useEffect(() => {
    if (jj.info?.is_jj && activeTab === "snapshots") {
      jj.fetchEvolog("@");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jj.info?.is_jj, activeTab, currentRepo]);

  const handleCommitClick = (hexsha: string) => {
    if (filePath) {
      fetchDiff(filePath, hexsha);
    }
  };

  const handleJJRevClick = (changeId: string) => {
    if (filePath) {
      jj.fetchDiff(changeId, filePath);
    }
  };

  const handleEvologToggle = (changeId: string) => {
    if (expandedEvolog === changeId) {
      setExpandedEvolog(null);
    } else {
      setExpandedEvolog(changeId);
      jj.fetchEvolog(changeId);
    }
  };

  const breadcrumbs = filePath ? filePath.split("/") : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AppLink
                to={buildPath(filePath)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 no-underline"
                title="Back to file"
              >
                <ArrowLeft size={20} />
              </AppLink>
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br",
                activeTab === "snapshots"
                  ? "from-violet-500 to-purple-600"
                  : "from-blue-500 to-indigo-600",
              )}>
                {activeTab === "snapshots" ? (
                  <Camera size={18} className="text-white" />
                ) : (
                  <GitBranch size={18} className="text-white" />
                )}
              </div>
              <div>
                <h1 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                  File History
                </h1>
                <nav className="flex items-center text-xs text-slate-500 space-x-1 mt-0.5">
                  {isMultiRepo && currentRepo && (
                    <>
                      <AppLink
                        to={`/${currentRepo}`}
                        className="hover:text-blue-600 no-underline text-inherit"
                      >
                        {currentRepo}
                      </AppLink>
                      <ChevronRight size={10} className="text-slate-300" />
                    </>
                  )}
                  {breadcrumbs.map((part, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <ChevronRight size={10} className="text-slate-300" />
                      )}
                      <span
                        className={cn(
                          i === breadcrumbs.length - 1
                            ? "font-medium text-slate-700 dark:text-slate-300"
                            : "hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer",
                        )}
                      >
                        {part}
                      </span>
                    </React.Fragment>
                  ))}
                </nav>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 mt-3 border-b border-slate-200 dark:border-slate-700 -mb-px">
            <button
              onClick={() => setActiveTab("commits")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === "commits"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
              )}
            >
              <GitBranch size={14} />
              Commits
              {(jj.info?.is_jj ? jj.revisions.length : history.length) > 0 && (
                <span className="text-xs ml-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                  {jj.info?.is_jj ? jj.revisions.length : history.length}
                </span>
              )}
            </button>
            {jj.info?.is_jj && (
              <button
                onClick={() => setActiveTab("snapshots")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "snapshots"
                    ? "border-violet-500 text-violet-600 dark:text-violet-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                )}
              >
                <Camera size={14} />
                Snapshots
                {jj.evolog.length > 0 && (
                  <span className="text-xs ml-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                    {jj.evolog.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Tab explanation */}
        <div className="flex items-start gap-2 mb-6 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
          <Info size={14} className="shrink-0 mt-0.5" />
          {activeTab === "commits" ? (
            <span>
              <strong className="text-slate-700 dark:text-slate-300">Commits</strong> are intentional revisions
              {jj.info?.is_jj ? " (jj revisions)" : " (git commits)"}
              {" "}— each one represents a deliberate save point where changes were described and committed.
            </span>
          ) : (
            <span>
              <strong className="text-slate-700 dark:text-slate-300">Snapshots</strong> are automatic saves that jj creates
              every time you modify a file. They capture every intermediate state of your working copy,
              even changes you haven&apos;t committed yet. Use this to recover lost work or see how a file evolved.
            </span>
          )}
        </div>

        {activeTab === "commits" ? (
          jj.info?.is_jj ? (
            <JJTimeline
              revisions={jj.revisions}
              evolog={jj.evolog}
              isLoading={jj.isLoading}
              expandedEvolog={expandedEvolog}
              onRevClick={handleJJRevClick}
              onEvologToggle={handleEvologToggle}
            />
          ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-600 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <GitBranch size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-500">
              No commit history found
            </p>
            <p className="text-sm mt-1">This file may be untracked or new.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-700" />

            <div className="space-y-1">
              {history.map((commit, index) => (
                <div
                  key={commit.hexsha}
                  className="relative flex items-start group"
                >
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      "relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1 transition-colors",
                      index === 0
                        ? "bg-blue-500 text-white"
                        : "bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 text-slate-400 group-hover:border-blue-300 group-hover:text-blue-500",
                    )}
                  >
                    <GitBranch size={16} />
                  </div>

                  {/* Commit card */}
                  <button
                    onClick={() => handleCommitClick(commit.hexsha)}
                    className={cn(
                      "ml-4 flex-1 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 transition-all cursor-pointer",
                      "hover:border-blue-200 dark:hover:border-blue-700 hover:shadow-md hover:bg-blue-50/30 dark:hover:bg-blue-900/20",
                      index === 0 &&
                        "border-blue-200 dark:border-blue-700 shadow-sm",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1.5">
                          <MessageSquare
                            size={14}
                            className="text-slate-400 shrink-0"
                          />
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {commit.message}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-slate-500">
                          <div className="flex items-center space-x-1.5">
                            <User size={12} />
                            <span>{commit.author_name}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Clock size={12} />
                            <span title={format(new Date(commit.date), "PPpp")}>
                              <RelativeTime date={commit.date} />
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-xs text-slate-400 bg-slate-50 dark:bg-slate-700 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-600 shrink-0">
                        {commit.hexsha.slice(0, 8)}
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
        ) : activeTab === "snapshots" && jj.info?.is_jj ? (
          /* Snapshots tab — jj evolog of working copy */
          jj.isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-600 border-t-violet-600 rounded-full animate-spin" />
            </div>
          ) : jj.evolog.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Camera size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-lg font-medium text-slate-500">
                No snapshots found
              </p>
              <p className="text-sm mt-1">jj hasn&apos;t captured any working-copy snapshots yet.</p>
            </div>
          ) : (
            <SnapshotTimeline
              evolog={jj.evolog}
              onEntryClick={(entry) => {
                if (filePath) {
                  jj.fetchDiff(entry.commit_id, filePath);
                }
              }}
            />
          )
        ) : null}
      </div>

      {/* Git Diff Viewer Modal */}
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
          <DiffViewerModal diff={diff} onClose={closeDiff} />
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

      {/* jj Diff Viewer Modal */}
      {jj.showDiff &&
        (jj.isDiffLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-8 flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-600 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-slate-600 dark:text-slate-300 font-medium">
                Loading jj diff...
              </p>
            </div>
          </div>
        ) : jj.diff ? (
          <DiffViewerModal
            diff={jj.diff}
            onClose={() => jj.setShowDiff(false)}
          />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-8 flex flex-col items-center">
              <p className="text-slate-600 dark:text-slate-300 font-medium mb-4">
                Could not load jj diff
              </p>
              <button
                onClick={() => jj.setShowDiff(false)}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ))}
    </div>
  );
};

// Inline DiffViewer modal for the history page (reuse DiffViewer component)
import { DiffViewer as DiffViewerComponent } from "../components/DiffViewer";
import { FileDiff, JJRevision, JJEvoEntry } from "../types";

const DiffViewerModal: React.FC<{ diff: FileDiff; onClose: () => void }> = ({
  diff,
  onClose,
}) => {
  return <DiffViewerComponent diff={diff} onClose={onClose} />;
};

// jj revision timeline component
const JJTimeline: React.FC<{
  revisions: JJRevision[];
  evolog: JJEvoEntry[];
  isLoading: boolean;
  expandedEvolog: string | null;
  onRevClick: (changeId: string) => void;
  onEvologToggle: (changeId: string) => void;
}> = ({
  revisions,
  evolog,
  isLoading,
  expandedEvolog,
  onRevClick,
  onEvologToggle,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-600 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (revisions.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Layers size={48} className="mx-auto mb-4 text-slate-300" />
        <p className="text-lg font-medium text-slate-500">
          No jj revisions found
        </p>
        <p className="text-sm mt-1">
          This file may not have any jj history yet.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-violet-200 dark:bg-violet-800" />

      <div className="space-y-1">
        {revisions.map((rev, index) => (
          <div key={rev.commit_id} className="relative">
            <div className="flex items-start group">
              {/* Timeline dot */}
              <div
                className={cn(
                  "relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1 transition-colors",
                  rev.is_working_copy
                    ? "bg-violet-500 text-white ring-2 ring-violet-300 dark:ring-violet-700"
                    : index === 0
                      ? "bg-violet-500 text-white"
                      : "bg-white dark:bg-slate-800 border-2 border-violet-200 dark:border-violet-700 text-violet-400 group-hover:border-violet-400 group-hover:text-violet-600",
                )}
              >
                {rev.is_working_copy ? (
                  <Pencil size={16} />
                ) : (
                  <Layers size={16} />
                )}
              </div>

              {/* Revision card */}
              <div className="ml-4 flex-1">
                <button
                  onClick={() => onRevClick(rev.change_id)}
                  className={cn(
                    "w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 transition-all cursor-pointer",
                    "hover:border-violet-200 dark:hover:border-violet-700 hover:shadow-md hover:bg-violet-50/30 dark:hover:bg-violet-900/20",
                    rev.is_working_copy &&
                      "border-violet-300 dark:border-violet-600 shadow-sm bg-violet-50/20 dark:bg-violet-900/10",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1.5">
                        <MessageSquare
                          size={14}
                          className="text-slate-400 shrink-0"
                        />
                        <span
                          className={cn(
                            "font-medium truncate",
                            rev.description
                              ? "text-slate-900 dark:text-slate-100"
                              : "text-slate-400 dark:text-slate-500 italic",
                          )}
                        >
                          {rev.description || "(no description)"}
                        </span>
                      </div>
                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <div className="flex items-center space-x-1.5">
                          <User size={12} />
                          <span>{rev.author}</span>
                        </div>
                        {rev.timestamp && (
                          <div className="flex items-center space-x-1.5">
                            <Clock size={12} />
                            <span
                              title={format(new Date(rev.timestamp), "PPpp")}
                            >
                              <RelativeTime date={rev.timestamp} />
                            </span>
                          </div>
                        )}
                        {rev.bookmarks.length > 0 && (
                          <div className="flex items-center space-x-1.5">
                            <Bookmark size={12} />
                            <span>
                              {rev.bookmarks.map((b, i) => (
                                <span
                                  key={b}
                                  className="text-violet-600 dark:text-violet-400"
                                >
                                  {i > 0 && ", "}
                                  {b}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-mono text-xs text-violet-500 bg-violet-50 dark:bg-violet-900/30 px-2 py-1 rounded-md border border-violet-100 dark:border-violet-800">
                        {rev.change_id}
                      </span>
                      {rev.is_working_copy && (
                        <span className="text-[10px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold">
                          @ working copy
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Evolution toggle button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEvologToggle(rev.change_id);
                  }}
                  className={cn(
                    "mt-1 ml-2 text-xs flex items-center space-x-1 px-2 py-1 rounded transition-colors",
                    expandedEvolog === rev.change_id
                      ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30"
                      : "text-slate-400 hover:text-violet-500 hover:bg-slate-50 dark:hover:bg-slate-800",
                  )}
                >
                  <Layers size={12} />
                  <span>
                    {expandedEvolog === rev.change_id
                      ? "Hide evolution"
                      : "Show evolution"}
                  </span>
                </button>

                {/* Evolog entries */}
                {expandedEvolog === rev.change_id && evolog.length > 0 && (
                  <div className="mt-2 ml-4 border-l-2 border-violet-200 dark:border-violet-800 pl-4 space-y-2">
                    {evolog.map((entry, i) => (
                      <div
                        key={`${entry.commit_id}-${i}`}
                        className={cn(
                          "bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-sm",
                          entry.hidden && "opacity-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-700 dark:text-slate-300 truncate">
                              {entry.description || "(no description)"}
                            </p>
                            {entry.operation && (
                              <p className="text-xs text-slate-500 mt-1 font-mono">
                                {entry.operation}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-xs text-slate-400 shrink-0">
                            <span className="font-mono">
                              {entry.commit_id.slice(0, 12)}
                            </span>
                            {entry.hidden && (
                              <span className="text-amber-500 text-[10px]">
                                hidden
                              </span>
                            )}
                            {entry.timestamp && (
                              <span>
                                <RelativeTime date={entry.timestamp} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Snapshot timeline — shows evolog of working copy (automatic jj saves)
const SnapshotTimeline: React.FC<{
  evolog: JJEvoEntry[];
  onEntryClick: (entry: JJEvoEntry) => void;
}> = ({ evolog, onEntryClick }) => {
  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-violet-200 dark:bg-violet-800" />

      <div className="space-y-1">
        {evolog.map((entry, index) => (
          <div
            key={`${entry.commit_id}-${index}`}
            className="relative flex items-start group"
          >
            {/* Timeline dot */}
            <div
              className={cn(
                "relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1 transition-colors",
                index === 0
                  ? "bg-violet-500 text-white"
                  : entry.hidden
                    ? "bg-slate-200 dark:bg-slate-700 border-2 border-slate-300 dark:border-slate-600 text-slate-400"
                    : "bg-white dark:bg-slate-800 border-2 border-violet-200 dark:border-violet-700 text-violet-400 group-hover:border-violet-400 group-hover:text-violet-500",
              )}
            >
              <Camera size={16} />
            </div>

            {/* Snapshot card */}
            <button
              onClick={() => onEntryClick(entry)}
              className={cn(
                "ml-4 flex-1 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 transition-all cursor-pointer",
                "hover:border-violet-200 dark:hover:border-violet-700 hover:shadow-md hover:bg-violet-50/30 dark:hover:bg-violet-900/20",
                index === 0 && "border-violet-200 dark:border-violet-700 shadow-sm",
                entry.hidden && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <MessageSquare size={14} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {entry.description || "(automatic snapshot)"}
                    </span>
                    {entry.hidden && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                        hidden
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-slate-500">
                    {entry.operation && (
                      <div className="flex items-center space-x-1.5">
                        <Layers size={12} />
                        <span className="font-mono">{entry.operation}</span>
                      </div>
                    )}
                    {entry.timestamp && (
                      <div className="flex items-center space-x-1.5">
                        <Clock size={12} />
                        <span title={format(new Date(entry.timestamp), "PPpp")}>
                          <RelativeTime date={entry.timestamp} />
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-400 bg-slate-50 dark:bg-slate-700 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-600 shrink-0">
                  {entry.commit_id.slice(0, 12)}
                </span>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
