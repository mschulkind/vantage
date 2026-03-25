import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  Gift,
  Wrench,
  AlertTriangle,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { changelog, appVersion } from "virtual:changelog";
import type { ChangelogEntry } from "virtual:changelog";

const LAST_SEEN_KEY = "vantage:lastSeenVersion";
const OPT_OUT_KEY = "vantage:whatsNewOptOut";

/** Compare semver strings. Returns true if a > b. */
function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

function getNewEntries(since: string | null): ChangelogEntry[] {
  if (!since) return changelog;
  return changelog.filter((e) => isNewerVersion(e.version, since));
}

const sectionIcons: Record<string, React.ReactNode> = {
  Added: <Gift size={14} className="text-green-500" />,
  Changed: <Sparkles size={14} className="text-blue-500" />,
  Fixed: <Wrench size={14} className="text-amber-500" />,
  Deprecated: <AlertTriangle size={14} className="text-orange-500" />,
  Removed: <Trash2 size={14} className="text-red-500" />,
};

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [optOut, setOptOut] = useState(() => {
    try {
      return localStorage.getItem(OPT_OUT_KEY) === "true";
    } catch {
      return false;
    }
  });

  const lastSeen = (() => {
    try {
      return localStorage.getItem(LAST_SEEN_KEY);
    } catch {
      return null;
    }
  })();

  const entries = getNewEntries(lastSeen);

  const handleClose = useCallback(() => {
    try {
      localStorage.setItem(LAST_SEEN_KEY, appVersion);
      localStorage.setItem(OPT_OUT_KEY, optOut ? "true" : "false");
    } catch {
      /* ignore */
    }
    onClose();
  }, [onClose, optOut]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKey, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKey, { capture: true });
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="What's New"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              What's New
            </h2>
            <span className="text-xs font-mono text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
              v{appVersion}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
              You're up to date! No new changes since your last visit.
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.version}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    v{entry.version}
                  </h3>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {entry.date}
                  </span>
                </div>
                <div className="space-y-3">
                  {entry.sections.map((section) => (
                    <div key={section.title}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {sectionIcons[section.title] || (
                          <ChevronRight
                            size={14}
                            className="text-slate-400"
                          />
                        )}
                        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {section.title}
                        </h4>
                      </div>
                      <ul className="space-y-1 ml-5">
                        {section.items.map((item, i) => (
                          <li
                            key={i}
                            className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed list-disc"
                            dangerouslySetInnerHTML={{
                              __html: item
                                .replace(
                                  /\*\*(.+?)\*\*/g,
                                  '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>',
                                )
                                .replace(
                                  /`(.+?)`/g,
                                  '<code class="text-xs bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">$1</code>',
                                ),
                            }}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={optOut}
              onChange={(e) => setOptOut(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 h-3.5 w-3.5"
            />
            Don't show automatically
          </label>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};


