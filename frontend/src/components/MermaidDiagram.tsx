import React, { useEffect, useState, useRef, useMemo, memo } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { Modal } from "./Modal";
import { svgCache } from "../lib/mermaidCache";
import { getMermaid } from "../lib/mermaidLoader";

interface MermaidDiagramProps {
  code: string;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Mermaid wraps parse errors in a message like "Parse error on line N: ..."
    // Strip the "Error: " prefix and any d3/dom noise
    const msg = err.message;
    // Try to find the most useful part of the error
    const parseMatch = msg.match(
      /(?:Parse error|Syntax error|Error).*?(?:line \d+.*)/i,
    );
    if (parseMatch) return parseMatch[0];
    // Fallback: first line only (mermaid errors can be very verbose)
    return msg.split("\n")[0].slice(0, 200);
  }
  if (typeof err === "string") return err.split("\n")[0].slice(0, 200);
  return "Unknown error";
}

const MermaidDiagramInner: React.FC<MermaidDiagramProps> = ({ code }) => {
  const hasCached = svgCache.has(code);
  const [svg, setSvg] = useState<string>(() => svgCache.get(code) || "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasCached);
  const [minHeight, setMinHeight] = useState<string>("auto");
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number | null>(null);

  // Generate a stable ID based on code hash
  const stableId = useMemo(() => {
    // Simple hash function for stable IDs
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `mermaid-${Math.abs(hash).toString(36)}`;
  }, [code]);

  useEffect(() => {
    // If we have a cached SVG, rendering is done
    if (hasCached) {
      return;
    }

    let mounted = true;

    const renderDiagram = async () => {
      try {
        // Capture current height before rendering to maintain stability
        if (containerRef.current) {
          const height = containerRef.current.offsetHeight;
          lastHeightRef.current = height;
          setMinHeight(`${height}px`);
        }

        const m = await getMermaid();
        const id = `${stableId}-${Date.now()}`;
        const { svg: renderedSvg } = await m.render(id, code);

        if (mounted) {
          // Cache the rendered SVG
          svgCache.set(code, renderedSvg);
          setSvg(renderedSvg);
          setErrorMessage(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (mounted) {
          setErrorMessage(extractErrorMessage(err));
          setIsLoading(false);
        }
      }
    };

    renderDiagram();

    return () => {
      mounted = false;
    };
  }, [code, stableId, hasCached]);

  if (errorMessage) {
    return (
      <div
        data-testid="mermaid-container"
        className="my-4 rounded-md border border-yellow-300/40 bg-yellow-50/50 dark:border-yellow-700/40 dark:bg-yellow-950/20 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-yellow-800 dark:text-yellow-200">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">Diagram syntax error</span>
          <span className="text-yellow-700/70 dark:text-yellow-300/60">
            — {errorMessage}
          </span>
        </div>
        <div className="border-t border-yellow-300/30 dark:border-yellow-700/30">
          <button
            onClick={() => setShowSource(!showSource)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-yellow-700/60 dark:text-yellow-400/50 hover:text-yellow-800 dark:hover:text-yellow-300 transition-colors w-full"
          >
            {showSource ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            {showSource ? "Hide source" : "Show source"}
          </button>
          {showSource && (
            <pre className="px-4 pb-3 text-xs font-mono text-yellow-800/70 dark:text-yellow-200/60 overflow-auto whitespace-pre-wrap">
              {code}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        data-testid="mermaid-container"
        className="relative group inline-block max-w-full"
        style={{ minHeight: isLoading ? minHeight : "auto" }}
      >
        <div
          className={`mermaid flex justify-center my-4 overflow-x-auto transition-opacity duration-150 ${isLoading ? "opacity-50" : "opacity-100"}`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {svg && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="absolute top-2 right-2 p-2 bg-white/90 shadow-sm border rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50"
            aria-label="Maximize diagram"
          >
            <Maximize2 className="w-4 h-4 text-gray-600" />
          </button>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Mermaid Diagram"
      >
        <div
          className="flex justify-center items-center min-h-[50vh]"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </Modal>
    </>
  );
};

// Wrap with React.memo to prevent re-renders when parent re-renders
// Only re-render if `code` actually changes
export const MermaidDiagram = memo(
  MermaidDiagramInner,
  (prevProps, nextProps) => {
    return prevProps.code === nextProps.code;
  },
);
