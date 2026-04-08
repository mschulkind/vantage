/**
 * Client-side utility to find and render mermaid code blocks in a container.
 *
 * After calling `renderMarkdown()`, mermaid blocks come through as
 * `<pre><code class="language-mermaid">...</code></pre>`. This function
 * finds those blocks and replaces them with rendered SVG diagrams.
 *
 * Framework-agnostic — works in any browser environment.
 */

import { svgCache } from "./mermaidCache.js";
import { getMermaid } from "./mermaidLoader.js";

export interface RenderMermaidOptions {
  /** CSS class to add to the SVG wrapper div (default: "mermaid") */
  className?: string;
  /** Called when a diagram fails to render */
  onError?: (code: string, error: Error) => void;
}

/**
 * Find all `<pre><code class="language-mermaid">` blocks in a container
 * and replace them with rendered SVG diagrams.
 *
 * @param container - DOM element containing rendered markdown HTML
 * @param options - Optional configuration
 * @returns Promise that resolves when all diagrams are rendered
 *
 * @example
 * ```ts
 * import { renderMarkdown, renderMermaidBlocks } from "vantage-md";
 *
 * const { html } = await renderMarkdown(content);
 * container.innerHTML = html;
 * await renderMermaidBlocks(container);
 * ```
 */
export async function renderMermaidBlocks(
  container: HTMLElement,
  options: RenderMermaidOptions = {},
): Promise<void> {
  const { className = "mermaid", onError } = options;

  const codeBlocks = container.querySelectorAll(
    'pre > code.language-mermaid, pre > code[class*="language-mermaid"]',
  );
  if (codeBlocks.length === 0) return;

  const mermaid = await getMermaid();

  const renderPromises = Array.from(codeBlocks).map(async (codeEl) => {
    const preEl = codeEl.parentElement;
    if (!preEl) return;

    const code = codeEl.textContent || "";
    if (!code.trim()) return;

    // Check cache first
    const cached = svgCache.get(code);
    if (cached) {
      replaceWithSvg(preEl, cached, className);
      return;
    }

    try {
      // Generate a stable ID from code hash
      let hash = 0;
      for (let i = 0; i < code.length; i++) {
        hash = (hash << 5) - hash + code.charCodeAt(i);
        hash = hash & hash;
      }
      const id = `mermaid-${Math.abs(hash).toString(36)}-${Date.now()}`;

      const { svg } = await mermaid.render(id, code);
      svgCache.set(code, svg);
      replaceWithSvg(preEl, svg, className);
    } catch (err) {
      if (onError) {
        onError(code, err instanceof Error ? err : new Error(String(err)));
      }
    }
  });

  await Promise.all(renderPromises);
}

function replaceWithSvg(
  preEl: HTMLElement,
  svg: string,
  className: string,
): void {
  const wrapper = document.createElement("div");
  wrapper.className = className;
  wrapper.innerHTML = svg;
  preEl.replaceWith(wrapper);
}
