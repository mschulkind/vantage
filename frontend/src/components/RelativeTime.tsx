import React from "react";
import { useRelativeTime } from "../hooks/useRelativeTime";

interface RelativeTimeProps {
  date: Date | string | null | undefined;
  addSuffix?: boolean;
}

/** Renders a relative time string that auto-updates without a page refresh. */
export const RelativeTime: React.FC<RelativeTimeProps> = ({
  date,
  addSuffix = true,
}) => {
  const text = useRelativeTime(date, { addSuffix });
  return <>{text}</>;
};
