import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import type { ReviewComment } from "../types";

interface ReviewCommentViewerProps {
  comment: ReviewComment;
  anchorRect: DOMRect;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const ReviewCommentViewer: React.FC<ReviewCommentViewerProps> = ({
  comment,
  anchorRect,
  onDelete,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing immediately from the same click
    const id = setTimeout(
      () => document.addEventListener("mousedown", handler),
      0,
    );
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl"
      style={{
        top: anchorRect.bottom + 8,
        left: Math.max(16, anchorRect.left + anchorRect.width / 2 - 144),
      }}
    >
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Comment
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDelete(comment.id)}
            className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
            title="Delete comment"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded px-2 py-1.5 border-l-2 border-blue-400 line-clamp-4">
          {comment.selected_text}
        </div>
        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
          {comment.comment}
        </p>
      </div>
    </div>,
    document.body,
  );
};
