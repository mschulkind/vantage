import React, { memo, useCallback, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import { MermaidDiagram } from "./MermaidDiagram";
import { FrontmatterDisplay } from "./FrontmatterDisplay";
import { parseFrontmatter } from "../lib/frontmatter";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { shouldHandleInternalNavigation } from "../lib/navigation";
import { useRepoStore } from "../stores/useRepoStore";
import { useDeltaFlash } from "../hooks/useDeltaFlash";

interface MarkdownViewerProps {
  content: string;
  currentPath: string;
}

// Sanitization schema: allows GFM, KaTeX, syntax highlighting, and heading anchors
// while blocking scripts, event handlers, iframes, and other XSS vectors.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // KaTeX elements
    "math",
    "semantics",
    "mrow",
    "mi",
    "mo",
    "mn",
    "msup",
    "msub",
    "mfrac",
    "mover",
    "munder",
    "msqrt",
    "mroot",
    "mtable",
    "mtr",
    "mtd",
    "mtext",
    "mspace",
    "annotation",
    // Other
    "figure",
    "figcaption",
    "summary",
    "details",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] || []), "className", "style"],
    code: [...(defaultSchema.attributes?.code || []), "className"],
    span: [...(defaultSchema.attributes?.span || []), "className", "style"],
    div: [...(defaultSchema.attributes?.div || []), "className", "style"],
    a: [...(defaultSchema.attributes?.a || []), "id", "className"],
    math: ["xmlns"],
    annotation: ["encoding"],
    img: [...(defaultSchema.attributes?.img || []), "loading"],
    td: [...(defaultSchema.attributes?.td || []), "style"],
    th: [...(defaultSchema.attributes?.th || []), "style"],
  },
};

const MarkdownViewerInner: React.FC<MarkdownViewerProps> = ({
  content,
  currentPath,
}) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const isMultiRepo = useRepoStore((state) => state.isMultiRepo);
  const currentRepo = useRepoStore((state) => state.currentRepo);

  // Build path with repo prefix in multi-repo mode
  const buildPath = useCallback(
    (filePath: string): string => {
      if (isMultiRepo && currentRepo) {
        return `/${currentRepo}/${filePath}`;
      }
      return `/${filePath}`;
    },
    [isMultiRepo, currentRepo],
  );

  // Get API base for content requests
  const getApiBase = useCallback((): string => {
    if (isMultiRepo && currentRepo) {
      return `/api/r/${encodeURIComponent(currentRepo)}`;
    }
    return "/api";
  }, [isMultiRepo, currentRepo]);

  // Parse frontmatter from content
  const { frontmatter, body } = useMemo(() => {
    return parseFrontmatter(content);
  }, [content]);

  const handleLinkClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      // Anchor links within the same doc: scroll inside the content container
      if (href.startsWith("#")) {
        e.preventDefault();
        const id = href.slice(1);
        const el = document.getElementById(id);
        if (el) {
          // Find the scrollable content container (has overflow-y-auto)
          const scrollContainer =
            el.closest("[data-content-scroll]") ||
            el.closest(".overflow-y-auto");
          if (scrollContainer) {
            const offset =
              el.getBoundingClientRect().top -
              scrollContainer.getBoundingClientRect().top +
              scrollContainer.scrollTop;
            scrollContainer.scrollTo({ top: offset - 16 });
          } else {
            el.scrollIntoView();
          }
        }
        return;
      }

      if (href.startsWith("http") || href.startsWith("mailto:")) return;

      // Allow browser default for Ctrl+click, Cmd+click, middle-click, etc.
      if (!shouldHandleInternalNavigation(e)) {
        return;
      }

      e.preventDefault();

      // Handle cross-doc anchor links (e.g. other-doc.md#section)
      const [pathPart, hashPart] = href.split("#");

      // Resolve relative path
      const parts = currentPath.split("/");
      parts.pop();
      const dir = parts.join("/");

      // Clean up href
      const cleanHref = pathPart.replace(/^\.\//, "");
      const resolvedPath = dir ? `${dir}/${cleanHref}` : cleanHref;

      const targetUrl =
        buildPath(resolvedPath) + (hashPart ? `#${hashPart}` : "");
      navigate(targetUrl);
    },
    [currentPath, navigate, buildPath],
  );

  const transformImageUri = useCallback(
    (uri: string, key?: string) => {
      // Only transform image sources, leave links alone as they are handled by handleLinkClick
      if (key === "href") {
        return uri;
      }

      if (uri.startsWith("http") || uri.startsWith("data:")) return uri;

      // Resolve relative path based on currentPath
      const parts = currentPath.split("/");
      parts.pop(); // remove filename
      const dir = parts.join("/");
      const resolvedPath = dir ? `${dir}/${uri}` : uri;
      const apiBase = getApiBase();

      return `${apiBase}/content?path=${encodeURIComponent(resolvedPath)}`;
    },
    [currentPath, getApiBase],
  );

  // Helper to resolve relative link paths to absolute paths
  const resolveHref = useCallback(
    (href: string | undefined): string => {
      if (!href) return "";
      if (
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("#") ||
        href.startsWith("/")
      ) {
        return href;
      }

      // Handle cross-doc anchors (e.g. other.md#section)
      const [pathPart, hashPart] = href.split("#");

      // Resolve relative path based on currentPath
      const parts = currentPath.split("/");
      parts.pop(); // remove filename
      const dir = parts.join("/");
      const cleanHref = pathPart.replace(/^\.\//, "");
      const resolvedPath = dir ? `${dir}/${cleanHref}` : cleanHref;
      return buildPath(resolvedPath) + (hashPart ? `#${hashPart}` : "");
    },
    [currentPath, buildPath],
  );

  // Delta flash: highlight only changed blocks on live updates
  useDeltaFlash(containerRef, content, currentPath);

  // Memoize markdown components to prevent unnecessary re-renders
  const markdownComponents = useMemo(
    () => ({
      a({
        href,
        children,
        ...props
      }: {
        href?: string;
        children?: React.ReactNode;
      } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
        const resolvedHref = resolveHref(href);
        return (
          <a
            href={resolvedHref}
            onClick={(e) => href && handleLinkClick(e, href)}
            {...props}
          >
            {children}
          </a>
        );
      },
      code(
        props: {
          children?: React.ReactNode;
          className?: string;
        } & React.HTMLAttributes<HTMLElement>,
      ) {
        const { children, className, ...rest } = props;
        const match = /language-(\w+)/.exec(className || "");
        // Check if it's a block code (has newline at end usually) or explicit class
        if (match && match[1] === "mermaid") {
          return <MermaidDiagram code={String(children).replace(/\n$/, "")} />;
        }
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
    }),
    [handleLinkClick, resolveHref],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "prose prose-slate dark:prose-invert max-w-none",
        // Headings: GitHub-like sizing and spacing
        "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-slate-900 dark:prose-headings:text-slate-100",
        "prose-h1:text-[2em] prose-h1:mb-3 prose-h1:pb-[0.3em] prose-h1:border-b prose-h1:border-slate-200 dark:prose-h1:border-slate-700",
        "prose-h2:text-[1.5em] prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-[0.3em] prose-h2:border-b prose-h2:border-slate-200 dark:prose-h2:border-slate-700",
        "prose-h3:text-[1.25em] prose-h3:mt-6 prose-h3:mb-2",
        "prose-h4:text-[1em] prose-h4:mt-6 prose-h4:mb-2",

        // Body text: tighter line height and spacing to match GitHub
        "prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-[1.5] prose-p:my-[16px]",

        // Lists: tighter spacing
        "prose-ul:my-[16px] prose-ul:list-disc prose-li:my-0.5 prose-li:marker:text-slate-900 dark:prose-li:marker:text-slate-300",
        "prose-ol:my-[16px] prose-li:marker:text-slate-900 dark:prose-li:marker:text-slate-300",

        // Code blocks: GitHub-like light gray / dark background
        "prose-pre:bg-slate-50 dark:prose-pre:bg-slate-800 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-700 prose-pre:p-4 prose-pre:rounded-md prose-pre:text-[85%] prose-pre:leading-[1.45]",

        // Links: Standard blue
        "prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline",

        // Images
        "prose-img:rounded-lg prose-img:my-4",

        // Blockquotes: Simpler vertical bar style
        "prose-blockquote:border-l-[0.25em] prose-blockquote:border-slate-300 dark:prose-blockquote:border-slate-600 prose-blockquote:pl-4 prose-blockquote:text-slate-600 dark:prose-blockquote:text-slate-400 prose-blockquote:italic",

        // Inline code: GitHub-like style (pill, light bg)
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-[0.4em] prose-code:py-[0.2em] prose-code:rounded-md prose-code:text-slate-800 dark:prose-code:text-slate-200 prose-code:font-mono prose-code:text-[85%] prose-code:font-normal prose-code:border prose-code:border-slate-200/50 dark:prose-code:border-slate-700/50",

        // Tables: tighter styling
        "prose-table:text-sm",
        "prose-th:px-3 prose-th:py-1.5 prose-th:border prose-th:border-slate-200 dark:prose-th:border-slate-700",
        "prose-td:px-3 prose-td:py-1.5 prose-td:border prose-td:border-slate-200 dark:prose-td:border-slate-700",
      )}
    >
      <FrontmatterDisplay frontmatter={frontmatter} />
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          rehypeSlug,
          rehypeHighlight,
          rehypeKatex,
        ]}
        urlTransform={transformImageUri}
        components={markdownComponents}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
};

// Memoize to prevent re-renders when parent re-renders but content hasn't changed
export const MarkdownViewer = memo(
  MarkdownViewerInner,
  (prevProps, nextProps) => {
    return (
      prevProps.content === nextProps.content &&
      prevProps.currentPath === nextProps.currentPath
    );
  },
);
