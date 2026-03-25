import type { Plugin } from "vite";
import fs from "fs";
import path from "path";

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: { title: string; items: string[] }[];
}

/**
 * Vite plugin that parses CHANGELOG.md at build time and exposes it
 * as a virtual module `virtual:changelog`.
 *
 * Usage:
 *   import { changelog, appVersion } from "virtual:changelog";
 */
export function changelogPlugin(): Plugin {
  const virtualModuleId = "virtual:changelog";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  return {
    name: "vantage-changelog",
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return;

      // Read CHANGELOG.md from project root (one level up from frontend/)
      const changelogPath = path.resolve(__dirname, "..", "CHANGELOG.md");
      const pkgPath = path.resolve(__dirname, "package.json");

      let changelog: ChangelogEntry[] = [];
      let appVersion = "0.0.0";

      try {
        const raw = fs.readFileSync(changelogPath, "utf-8");
        changelog = parseChangelog(raw);
      } catch {
        console.warn("[changelog-plugin] Could not read CHANGELOG.md");
      }

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        appVersion = pkg.version || "0.0.0";
      } catch {
        console.warn("[changelog-plugin] Could not read package.json version");
      }

      return `export const changelog = ${JSON.stringify(changelog)};
export const appVersion = ${JSON.stringify(appVersion)};`;
    },
  };
}

/**
 * Parse Keep a Changelog format into structured entries.
 */
function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let currentSection: { title: string; items: string[] } | null = null;

  for (const line of raw.split("\n")) {
    // Match version heading: ## [0.2.0] - 2026-03-25
    const versionMatch = line.match(
      /^## \[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/,
    );
    if (versionMatch) {
      if (current) entries.push(current);
      current = {
        version: versionMatch[1],
        date: versionMatch[2],
        sections: [],
      };
      currentSection = null;
      continue;
    }

    // Match section heading: ### Added, ### Changed, etc.
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch && current) {
      currentSection = { title: sectionMatch[1], items: [] };
      current.sections.push(currentSection);
      continue;
    }

    // Match list item: - Some change
    const itemMatch = line.match(/^- (.+)/);
    if (itemMatch && currentSection) {
      currentSection.items.push(itemMatch[1]);
    }
  }

  if (current) entries.push(current);
  return entries;
}
