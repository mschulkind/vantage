/**
 * Simple browser-compatible frontmatter parser.
 * Parses YAML frontmatter from markdown content.
 */

import YAML from "yaml";

interface ParsedContent {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Parse frontmatter from markdown content.
 * Frontmatter must be delimited by --- at the start and end.
 */
export function parseFrontmatter(content: string): ParsedContent {
  // Check if content starts with frontmatter delimiter
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  // Find the closing delimiter
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  // Extract frontmatter YAML
  const yamlContent = content.slice(4, endIndex).trim();

  // Extract body (skip the closing --- and any following newline)
  const bodyStart = endIndex + 4;
  const body = content.slice(bodyStart).replace(/^\n/, "");

  try {
    const frontmatter = YAML.parse(yamlContent) as Record<string, unknown>;
    return { frontmatter: frontmatter || {}, body };
  } catch {
    // If YAML parsing fails, return original content
    return { frontmatter: {}, body: content };
  }
}
