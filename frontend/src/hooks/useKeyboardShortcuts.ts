import React, { useEffect, useState, useCallback } from "react";

/**
 * Hook that manages the keyboard shortcuts modal state and
 * registers all global keyboard shortcuts for the application.
 *
 * Supports single-key and two-key sequences (e.g. `g` then `h`).
 */
export const useKeyboardShortcuts = ({
  onOpenFilePicker,
  onToggleSidebar,
  onNavigate,
  onViewDiff,
  onViewHistory,
  contentScrollRef,
  isMultiRepo,
  currentRepo,
  enabled,
}: {
  onOpenFilePicker: () => void;
  onToggleSidebar: () => void;
  onNavigate: (path: string) => void;
  onViewDiff: () => void;
  onViewHistory: () => void;
  contentScrollRef: React.RefObject<HTMLDivElement | null>;
  isMultiRepo: boolean;
  currentRepo: string | null;
  enabled: boolean;
}) => {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const pendingKeyRef = React.useRef<string | null>(null);
  const pendingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearPending = useCallback(() => {
    pendingKeyRef.current = null;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const isInputFocused = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      // Don't intercept when modifier keys are held (except Shift for ?, G, D)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // Handle second key of a sequence
      if (pendingKeyRef.current) {
        const first = pendingKeyRef.current;
        clearPending();

        if (first === "g") {
          if (key === "h") {
            e.preventDefault();
            onNavigate(isMultiRepo && currentRepo ? `/${currentRepo}` : "/");
            return;
          }
          if (key === "r") {
            e.preventDefault();
            onNavigate(
              isMultiRepo && currentRepo ? `/recent/${currentRepo}` : "/recent",
            );
            return;
          }
          if (key === "g") {
            // gg = scroll to top
            e.preventDefault();
            contentScrollRef.current?.scrollTo({ top: 0 });
            return;
          }
        }
        // Unrecognized sequence — fall through to handle as single key
      }

      // Two-key sequence starters
      if (key === "g") {
        pendingKeyRef.current = "g";
        pendingTimerRef.current = setTimeout(clearPending, 800);
        return;
      }

      // Single-key shortcuts
      switch (key) {
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
          break;
        case "Escape":
          if (shortcutsOpen) {
            setShortcutsOpen(false);
          }
          break;
        case "t":
          // Handled by ViewerPage's existing listener — don't double-fire
          break;
        case "b":
          e.preventDefault();
          onToggleSidebar();
          break;
        case "j":
          e.preventDefault();
          contentScrollRef.current?.scrollBy({ top: 100 });
          break;
        case "k":
          e.preventDefault();
          contentScrollRef.current?.scrollBy({ top: -100 });
          break;
        case "G":
          // Shift+G = scroll to bottom
          if (e.shiftKey) {
            e.preventDefault();
            const el = contentScrollRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight });
          }
          break;
        case "D":
          // Shift+D = toggle dark mode
          if (e.shiftKey) {
            e.preventDefault();
            const root = document.documentElement;
            const isDark = root.classList.contains("dark");
            const newTheme = isDark ? "light" : "dark";
            if (newTheme === "dark") {
              root.classList.add("dark");
            } else {
              root.classList.remove("dark");
            }
            try {
              localStorage.setItem("vantage:theme", newTheme);
            } catch {
              /* ignore */
            }
          }
          break;
        case "d":
          e.preventDefault();
          onViewDiff();
          break;
        case "h":
          e.preventDefault();
          onViewHistory();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearPending();
    };
  }, [
    enabled,
    shortcutsOpen,
    clearPending,
    onOpenFilePicker,
    onToggleSidebar,
    onNavigate,
    onViewDiff,
    onViewHistory,
    contentScrollRef,
    isMultiRepo,
    currentRepo,
  ]);

  return { shortcutsOpen, setShortcutsOpen };
};
