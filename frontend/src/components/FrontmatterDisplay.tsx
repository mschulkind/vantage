import React, { memo } from "react";
import { FileText } from "lucide-react";

interface FrontmatterDisplayProps {
  frontmatter: Record<string, unknown>;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): React.ReactNode {
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (isPlainObject(value)) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/** Render a list of strings as pill-shaped badges. */
function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/** Render a single value cell. */
function ValueCell({ value }: { value: unknown }) {
  if (isStringArray(value) && value.length > 0) {
    return <TagList items={value} />;
  }
  if (isPlainObject(value)) {
    return (
      <pre className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs font-mono overflow-x-auto text-slate-600 dark:text-slate-300">
        {formatValue(value)}
      </pre>
    );
  }
  return <span className="font-medium">{formatValue(value)}</span>;
}

/**
 * Flatten taxonomy-like objects (e.g. Zola `[taxonomies]`) into
 * top-level rows so each taxonomy gets its own labelled row.
 */
function flattenEntries(entries: [string, unknown][]): [string, unknown][] {
  const result: [string, unknown][] = [];
  for (const [key, value] of entries) {
    if (key === "taxonomies" && isPlainObject(value)) {
      for (const [taxKey, taxVal] of Object.entries(value)) {
        result.push([taxKey, taxVal]);
      }
    } else if (key === "extra" && isPlainObject(value)) {
      for (const [extraKey, extraVal] of Object.entries(value)) {
        result.push([extraKey, extraVal]);
      }
    } else {
      result.push([key, value]);
    }
  }
  return result;
}

const FrontmatterDisplayInner: React.FC<FrontmatterDisplayProps> = ({
  frontmatter,
}) => {
  const raw = Object.entries(frontmatter);
  if (raw.length === 0) return null;

  const entries = flattenEntries(raw);

  return (
    <div className="mb-8 rounded-lg overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="px-4 py-2.5 bg-white/60 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <FileText size={14} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Metadata
        </span>
      </div>
      <div className="p-4">
        <table className="w-full text-sm">
          <tbody>
            {entries.map(([key, value]) => (
              <tr
                key={key}
                className="border-b border-slate-200/60 dark:border-slate-700/60 last:border-0"
              >
                <td className="py-2 pr-4 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap align-top w-1/4 min-w-[100px]">
                  {key}
                </td>
                <td className="py-2 text-slate-800 dark:text-slate-200 align-top">
                  <ValueCell value={value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const FrontmatterDisplay = memo(FrontmatterDisplayInner);
