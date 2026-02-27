// Global cache for rendered SVGs to prevent re-renders
export const svgCache = new Map<string, string>();

// Export for testing purposes
export function clearMermaidCache() {
  svgCache.clear();
}
