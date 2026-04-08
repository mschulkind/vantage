import React, { useEffect, useState, useRef, useMemo, memo } from "react";
import { svgCache } from "./mermaidCache.js";
import { getMermaid } from "./mermaidLoader.js";

// Inline SVG icons to avoid lucide-react dependency
const AlertTriangleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
    <path d="m18 15-6-6-6 6" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-600">
    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" x2="14" y1="3" y2="10" /><line x1="3" x2="10" y1="21" y2="14" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);

interface MermaidDiagramProps {
  code: string;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    const parseMatch = msg.match(
      /(?:Parse error|Syntax error|Error).*?(?:line \d+.*)/i,
    );
    if (parseMatch) return parseMatch[0];
    return msg.split("\n")[0].slice(0, 200);
  }
  if (typeof err === "string") return err.split("\n")[0].slice(0, 200);
  return "Unknown error";
}

/** Simple modal for expanding diagrams */
function DiagramModal({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Mermaid Diagram</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close modal"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="p-4 overflow-auto flex-1">{children}</div>
      </div>
    </div>
  );
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

  const stableId = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `mermaid-${Math.abs(hash).toString(36)}`;
  }, [code]);

  useEffect(() => {
    if (hasCached) return;

    let mounted = true;

    const renderDiagram = async () => {
      try {
        if (containerRef.current) {
          const height = containerRef.current.offsetHeight;
          lastHeightRef.current = height;
          setMinHeight(`${height}px`);
        }

        const m = await getMermaid();
        const id = `${stableId}-${Date.now()}`;
        const { svg: renderedSvg } = await m.render(id, code);

        if (mounted) {
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
          <AlertTriangleIcon />
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
            {showSource ? <ChevronUpIcon /> : <ChevronDownIcon />}
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
            <MaximizeIcon />
          </button>
        )}
      </div>

      <DiagramModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      >
        <div
          className="flex justify-center items-center min-h-[50vh]"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </DiagramModal>
    </>
  );
};

export const MermaidDiagram = memo(
  MermaidDiagramInner,
  (prevProps, nextProps) => prevProps.code === nextProps.code,
);
