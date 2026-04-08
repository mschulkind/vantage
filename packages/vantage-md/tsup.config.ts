import { defineConfig } from "tsup";

export default defineConfig([
  // Main entry — framework-agnostic
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom", "mermaid", "yaml", "smol-toml"],
    treeshake: true,
  },
  // React entry — requires React peer dep
  {
    entry: { react: "src/react.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: [
      "react",
      "react-dom",
      "mermaid",
      "yaml",
      "smol-toml",
      "react-markdown",
      "remark-gfm",
      "remark-math",
      "rehype-raw",
      "rehype-sanitize",
      "rehype-highlight",
      "rehype-katex",
      "rehype-slug",
      "katex",
    ],
    treeshake: true,
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
  // CSS entries
  {
    entry: {
      styles: "src/styles/index.css",
      prose: "src/styles/prose.css",
    },
    outDir: "dist",
  },
]);
