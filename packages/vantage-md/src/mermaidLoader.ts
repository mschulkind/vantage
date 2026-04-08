import type mermaidAPI from "mermaid";

let mermaidInstance: typeof mermaidAPI | null = null;
let mermaidLoading: Promise<typeof mermaidAPI> | null = null;

const isDark = () =>
  typeof document !== "undefined" &&
  document.documentElement.classList.contains("dark");

export async function getMermaid(): Promise<typeof mermaidAPI> {
  if (mermaidInstance) return mermaidInstance;
  if (!mermaidLoading) {
    mermaidLoading = import("mermaid").then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        theme: isDark() ? "dark" : "default",
        securityLevel: "strict",
        suppressErrorRendering: true,
      });
      mermaidInstance = m;
      return m;
    });
  }
  return mermaidLoading;
}

export function resetMermaidLoader() {
  mermaidInstance = null;
  mermaidLoading = null;
}
