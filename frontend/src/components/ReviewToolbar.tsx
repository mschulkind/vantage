import React from "react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { useReviewStore } from "../stores/useReviewStore";

export const ReviewToolbar: React.FC = () => {
  const snapshots = useReviewStore((s) => s.snapshots);
  const currentIndex = useReviewStore((s) => s.currentSnapshotIndex);
  const setIndex = useReviewStore((s) => s.setSnapshotIndex);

  const total = snapshots.length + 1; // snapshots + live
  // null index = live (last position)
  const displayIndex = currentIndex !== null ? currentIndex + 1 : total;
  const isLive = currentIndex === null;

  if (snapshots.length === 0) return null;

  const goPrev = () => {
    if (displayIndex > 1) {
      setIndex(displayIndex - 2); // -2 because displayIndex is 1-based
    }
  };

  const goNext = () => {
    if (isLive) return;
    if (currentIndex !== null && currentIndex >= snapshots.length - 1) {
      setIndex(null); // go to live
    } else if (currentIndex !== null) {
      setIndex(currentIndex + 1);
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/50 text-xs">
      <History size={12} className="text-slate-400" />
      <button
        onClick={goPrev}
        disabled={displayIndex <= 1}
        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-slate-600 dark:text-slate-300 font-medium tabular-nums min-w-[4ch] text-center">
        {displayIndex}/{total}
      </span>
      <button
        onClick={goNext}
        disabled={isLive}
        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight size={14} />
      </button>
      {isLive && (
        <span className="text-green-600 dark:text-green-400 font-medium">
          Live
        </span>
      )}
      {!isLive && (
        <button
          onClick={() => setIndex(null)}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          Latest
        </button>
      )}
    </div>
  );
};
