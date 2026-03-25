import { useState, useEffect } from "react";
import { appVersion } from "virtual:changelog";

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

/** Hook to manage "What's New" auto-display logic. */
export function useWhatsNew() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const optOut = localStorage.getItem(OPT_OUT_KEY) === "true";
      if (optOut) return;
      const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
      if (!lastSeen || isNewerVersion(appVersion, lastSeen)) {
        const timer = setTimeout(() => setIsOpen(true), 500);
        return () => clearTimeout(timer);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
