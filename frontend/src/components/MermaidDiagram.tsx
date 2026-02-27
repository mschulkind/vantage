import React, { useEffect, useState, useRef, useMemo, memo } from "react";
import { Maximize2 } from "lucide-react";
import { Modal } from "./Modal";
import { svgCache } from "../lib/mermaidCache";
import { getMermaid } from "../lib/mermaidLoader";

interface MermaidDiagramProps {
  code: string;
}

const MermaidDiagramInner: React.FC<MermaidDiagramProps> = ({ code }) => {
  const hasCached = svgCache.has(code);
  const [svg, setSvg] = useState<string>(() => svgCache.get(code) || "");
  const [error, setError] = useState<boolean>(false);
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
          setError(false);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (mounted) {
          setError(true);
          setIsLoading(false);
        }
      }
    };

    renderDiagram();

    return () => {
      mounted = false;
    };
  }, [code, stableId, hasCached]);

  if (error) {
    return (
      <div
        data-testid="mermaid-container"
        className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm font-mono overflow-auto"
      >
        Failed to render diagram
        <pre className="mt-2 text-xs opacity-75">{code}</pre>
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
