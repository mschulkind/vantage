import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ClipboardCopy,
  MessageSquare,
  Trash2,
  X,
  CheckCircle2,
} from "lucide-react";
import { useReviewStore } from "../stores/useReviewStore";

interface ReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const comments = useReviewStore((s) => s.comments);
  const deleteComment = useReviewStore((s) => s.deleteComment);
  const copyAllToClipboard = useReviewStore((s) => s.copyAllToClipboard);
  const deleteReview = useReviewStore((s) => s.deleteReview);

  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  const activeComments = comments.filter((c) => !c.resolved);
  const resolvedComments = comments.filter((c) => c.resolved);

  const handleCopy = async () => {
    const ok = await copyAllToClipboard();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    if (confirmClear) {
      deleteReview();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[90] bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-[91] w-96 max-w-[90vw] bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-slate-500" />
            <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
              Review Comments
            </span>
            {activeComments.length > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                {activeComments.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
          >
            <X size={18} />
          </button>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm">
              <MessageSquare size={24} className="mb-2 opacity-40" />
              <p>No comments yet</p>
              <p className="text-xs mt-1">
                Select text in the document to add comments
              </p>
            </div>
          ) : (
            <>
              {/* Active comments */}
              {activeComments.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {activeComments.map((c) => (
                    <div key={c.id} className="px-4 py-3 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded px-2 py-1 border-l-2 border-blue-400 line-clamp-2 flex-1">
                          {c.selected_text}
                        </div>
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-opacity shrink-0"
                          title="Delete comment"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                        {c.comment}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Resolved comments */}
              {resolvedComments.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-y border-slate-100 dark:border-slate-700/50">
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                      Resolved ({resolvedComments.length})
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/50 opacity-60">
                    {resolvedComments.map((c) => (
                      <div key={c.id} className="px-4 py-3 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 flex-1">
                            <CheckCircle2
                              size={12}
                              className="text-green-500 shrink-0"
                            />
                            <span className="line-clamp-1 line-through">
                              {c.selected_text}
                            </span>
                          </div>
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-opacity shrink-0"
                            title="Delete comment"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap line-through">
                          {c.comment}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {comments.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              disabled={activeComments.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {copied ? (
                <>
                  <Check size={12} /> Copied!
                </>
              ) : (
                <>
                  <ClipboardCopy size={12} /> Copy All ({activeComments.length})
                </>
              )}
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 size={12} />
              {confirmClear ? "Confirm?" : "Clear All"}
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
};
