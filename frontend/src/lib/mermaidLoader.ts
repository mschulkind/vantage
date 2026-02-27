import type mermaidAPI from "mermaid";

// Lazy-loaded mermaid instance (loaded on first diagram render)
let mermaidInstance: typeof mermaidAPI | null = null;
let mermaidLoading: Promise<typeof mermaidAPI> | null = null;

const isDark = () => document.documentElement.classList.contains("dark");

export async function getMermaid(): Promise<typeof mermaidAPI> {
  if (mermaidInstance) return mermaidInstance;
  if (!mermaidLoading) {
    mermaidLoading = import("mermaid").then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        theme: isDark() ? "dark" : "default",
        securityLevel: "strict",
      });
      mermaidInstance = m;
      return m;
    });
  }
  return mermaidLoading;
}

/** Reset lazy-load state (for tests). */
export function resetMermaidLoader() {
  mermaidInstance = null;
  mermaidLoading = null;
}
