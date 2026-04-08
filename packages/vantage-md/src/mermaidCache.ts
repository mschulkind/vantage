// Global cache for rendered SVGs to prevent re-renders
export const svgCache = new Map<string, string>();

export function clearMermaidCache() {
  svgCache.clear();
}
