import React, { memo } from "react";
import { FileText } from "lucide-react";

interface FrontmatterDisplayProps {
  frontmatter: Record<string, unknown>;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

const FrontmatterDisplayInner: React.FC<FrontmatterDisplayProps> = ({
  frontmatter,
}) => {
  const entries = Object.entries(frontmatter);

  if (entries.length === 0) {
    return null;
  }

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
                  {typeof value === "object" &&
                  value !== null &&
                  !Array.isArray(value) ? (
                    <pre className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs font-mono overflow-x-auto text-slate-600 dark:text-slate-300">
                      {formatValue(value)}
                    </pre>
                  ) : (
                    <span className="font-medium">{formatValue(value)}</span>
                  )}
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
