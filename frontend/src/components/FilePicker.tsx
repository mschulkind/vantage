import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { File, Search } from "lucide-react";
import { cn } from "../lib/utils";

interface FilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  files: string[];
}

/** Subsequence (fuzzy) match: checks if all chars of query appear in str in order. */
function fuzzyMatch(
  query: string,
  str: string,
): { match: boolean; score: number; indices: number[] } {
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  const indices: number[] = [];
  let qi = 0;

  for (let si = 0; si < s.length && qi < q.length; si++) {
    if (s[si] === q[qi]) {
      indices.push(si);
      qi++;
    }
  }

  if (qi !== q.length) {
    return { match: false, score: 0, indices: [] };
  }

  // Score: prefer shorter strings, consecutive matches, and matches at word boundaries
  let score = 0;

  // Bonus for consecutive chars
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      score += 10;
    }
  }

  // Bonus for matching at start of path segments
  for (const idx of indices) {
    if (idx === 0 || s[idx - 1] === "/") {
      score += 5;
    }
  }

  // Penalise longer strings
  score -= str.length * 0.1;

  // Bonus for basename matches (filename, not directory)
  const lastSlash = s.lastIndexOf("/");
  const basenameStart = lastSlash + 1;
  const basenameIndices = indices.filter((i) => i >= basenameStart);
  score += basenameIndices.length * 3;

  return { match: true, score, indices };
}

interface MatchedFile {
  path: string;
  score: number;
  indices: number[];
}

function HighlightedPath({
  path,
  indices,
}: {
  path: string;
  indices: number[];
}) {
  const indexSet = new Set(indices);
  const lastSlash = path.lastIndexOf("/");

  return (
    <span className="truncate">
      {path.split("").map((char, i) => {
        const isHighlighted = indexSet.has(i);
        const isDir = i <= lastSlash;
        return (
          <span
            key={i}
            className={cn(
              isHighlighted && "text-blue-600 font-semibold",
              isDir && !isHighlighted && "text-slate-400",
            )}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

export const FilePicker: React.FC<FilePickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  files,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter + rank
  const results: MatchedFile[] = useMemo(() => {
    if (!query.trim()) {
      // No query: show all files sorted alphabetically, up to a reasonable limit
      return files
        .slice(0, 100)
        .map((f) => ({ path: f, score: 0, indices: [] }));
    }
    const matched: MatchedFile[] = [];
    for (const path of files) {
      const { match, score, indices } = fuzzyMatch(query, path);
      if (match) {
        matched.push({ path, score, indices });
      }
    }
    matched.sort((a, b) => b.score - a.score);
    return matched.slice(0, 100);
  }, [query, files]);

  // Track mounting state for cleanup
  const isMountedRef = useRef(true);

  // Reset selection when results change — but use ref to avoid setState in effect
  useEffect(() => {
    if (isMountedRef.current) {
      setSelectedIndex(0); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [results]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery(""); // eslint-disable-line react-hooks/set-state-in-effect
      setSelectedIndex(0);
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-file-item]");
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            onSelect(results[selectedIndex].path);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, onSelect, onClose],
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Search input */}
        <div className="flex items-center px-4 border-b border-slate-200 dark:border-slate-700">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name..."
            className="w-full px-3 py-3 text-sm outline-none bg-transparent placeholder:text-slate-400 text-slate-900 dark:text-slate-100"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="text-[10px] text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 font-mono shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-80">
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {query ? "No matching files" : "No files found"}
            </div>
          ) : (
            results.map((result, i) => (
              <div
                key={result.path}
                data-file-item
                className={cn(
                  "flex items-center px-4 py-2 text-sm cursor-pointer transition-colors",
                  i === selectedIndex
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300",
                )}
                onClick={() => {
                  onSelect(result.path);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <File
                  size={14}
                  className={cn(
                    "shrink-0 mr-2.5",
                    i === selectedIndex ? "text-blue-500" : "text-slate-400",
                  )}
                />
                <HighlightedPath path={result.path} indices={result.indices} />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {results.length} {results.length === 1 ? "file" : "files"}
            {query && ` matching "${query}"`}
          </span>
          <div className="flex items-center space-x-2">
            <span>
              <kbd className="border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 font-mono">
                ↑↓
              </kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 font-mono">
                ↵
              </kbd>{" "}
              open
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
