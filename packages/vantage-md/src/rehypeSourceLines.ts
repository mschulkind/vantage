/**
 * Rehype plugin that adds `data-source-line` attributes to block-level
 * elements based on their position in the original markdown source.
 *
 * This enables GitHub-style line anchors (#L42, #L42-L50) by giving
 * each rendered block a traceable line number from the source.
 */

import type { Root, Element } from "hast";
import type { Plugin } from "unified";

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "table",
  "tr",
  "ul",
  "ol",
  "hr",
  "div",
]);

function visit(node: Root | Element) {
  if ("children" in node) {
    for (const child of node.children) {
      if (child.type === "element") {
        if (BLOCK_TAGS.has(child.tagName) && child.position?.start?.line) {
          child.properties = child.properties || {};
          child.properties["dataSourceLine"] = child.position.start.line;
        }
        visit(child);
      }
    }
  }
}

const rehypeSourceLines: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree);
  };
};

export default rehypeSourceLines;
