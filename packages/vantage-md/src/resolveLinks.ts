/**
 * Rewrite relative links in rendered markdown HTML.
 *
 * After `renderMarkdown()` produces HTML, relative `href` values need to
 * be mapped to the consumer's routing structure. This utility handles that
 * without requiring a DOM — it operates on the HTML string directly.
 */

export interface ResolveLinkOptions {
  /** Base path to prepend to relative links (default: "/") */
  basePath?: string;
  /**
   * Custom rewriter function. Called for every relative href.
   * Return the rewritten href, or null to leave it unchanged.
   * If provided, basePath is ignored.
   */
  rewriter?: (href: string, currentPath: string) => string | null;
  /** Current file path — used to resolve relative references like `./other.md` */
  currentPath?: string;
}

/**
 * Rewrite relative links in rendered HTML.
 *
 * Processes all `href="..."` attributes, skipping:
 * - Absolute URLs (http://, https://, mailto:, etc.)
 * - Anchor-only links (#section)
 * - Already-absolute paths (/path/to/file)
 *
 * @example
 * ```ts
 * import { renderMarkdown, resolveLinks } from "vantage-md";
 *
 * const { html } = await renderMarkdown(content);
 *
 * // Simple: prepend a base path
 * const resolved = resolveLinks(html, { basePath: "/docs/", currentPath: "guides/setup.md" });
 *
 * // Custom: full control over link rewriting
 * const resolved = resolveLinks(html, {
 *   currentPath: "guides/setup.md",
 *   rewriter: (href, currentPath) => `/kb/${currentPath}/../${href}`,
 * });
 * ```
 */
export function resolveLinks(
  html: string,
  options: ResolveLinkOptions = {},
): string {
  const { basePath = "/", rewriter, currentPath = "" } = options;

  // Resolve the directory of the current file
  const parts = currentPath.split("/");
  parts.pop(); // remove filename
  const currentDir = parts.join("/");

  return html.replace(
    /href="([^"]*?)"/g,
    (_match: string, href: string): string => {
      // Skip absolute URLs, anchors, and already-absolute paths
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("data:") ||
        href.startsWith("#") ||
        href.startsWith("/")
      ) {
        return `href="${href}"`;
      }

      if (rewriter) {
        const result = rewriter(href, currentPath);
        if (result !== null) {
          return `href="${result}"`;
        }
        return `href="${href}"`;
      }

      // Default: resolve relative to currentPath, prepend basePath
      const [pathPart, hashPart] = href.split("#");
      const cleanHref = pathPart.replace(/^\.\//, "");
      const resolvedPath = currentDir
        ? `${currentDir}/${cleanHref}`
        : cleanHref;
      const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
      const finalHref = `${base}${resolvedPath}${hashPart ? `#${hashPart}` : ""}`;

      return `href="${finalHref}"`;
    },
  );
}
