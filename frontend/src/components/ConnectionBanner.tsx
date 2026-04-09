import React, { useEffect, useState } from "react";
import { useConnectionStore } from "../stores/useConnectionStore";
import { WifiOff } from "lucide-react";

function formatDuration(secs: number) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

export const ConnectionBanner: React.FC = () => {
  const connected = useConnectionStore((s) => s.connected);
  const disconnectedAt = useConnectionStore((s) => s.disconnectedAt);
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second while disconnected
  useEffect(() => {
    if (connected || !disconnectedAt) return;
    const update = () =>
      setElapsed(Math.floor((Date.now() - disconnectedAt) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [connected, disconnectedAt]);

  if (connected || !disconnectedAt) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shrink-0 z-50">
      <WifiOff size={16} className="shrink-0" />
      <span>
        Disconnected from backend
        {elapsed > 0 && ` (${formatDuration(elapsed)})`}
        {" — "}
        content may be out of date.
      </span>
      <span className="text-red-200 text-xs">
        Check that the server is running, then reload the page.
      </span>
    </div>
  );
};
