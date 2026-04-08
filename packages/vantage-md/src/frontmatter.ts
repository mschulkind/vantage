/**
 * Frontmatter parser for YAML (---) and TOML (+++) delimited content.
 * Works in both browser and server environments.
 */

import YAML from "yaml";
import { parse as parseTOML } from "smol-toml";

export type FrontmatterFormat = "yaml" | "toml" | "none";

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
  format: FrontmatterFormat;
}

/**
 * Parse frontmatter from markdown content.
 * Supports YAML (delimited by ---) and TOML (delimited by +++).
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  if (content.startsWith("+++")) {
    return parseFrontmatterWithDelimiter(content, "+++", "toml");
  }
  if (content.startsWith("---")) {
    return parseFrontmatterWithDelimiter(content, "---", "yaml");
  }
  return { frontmatter: {}, body: content, format: "none" };
}

function parseFrontmatterWithDelimiter(
  content: string,
  delimiter: string,
  format: "yaml" | "toml",
): ParsedFrontmatter {
  const searchStart = delimiter.length;
  const endIndex = content.indexOf(`\n${delimiter}`, searchStart);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content, format: "none" };
  }

  const raw = content.slice(searchStart + 1, endIndex).trim();
  const bodyStart = endIndex + 1 + delimiter.length;
  const body = content.slice(bodyStart).replace(/^\n/, "");

  try {
    const frontmatter =
      format === "toml"
        ? (parseTOML(raw) as Record<string, unknown>)
        : (YAML.parse(raw) as Record<string, unknown>);
    return { frontmatter: frontmatter || {}, body, format };
  } catch {
    return { frontmatter: {}, body: content, format: "none" };
  }
}
