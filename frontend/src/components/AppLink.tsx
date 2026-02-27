import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { shouldHandleInternalNavigation } from "../lib/navigation";

interface AppLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "onClick"> {
  /** The SPA route to navigate to (also used as href) */
  to: string;
  /** Optional click handler called before navigation. Return false to prevent. */
  onBeforeNavigate?: (e: React.MouseEvent<HTMLAnchorElement>) => boolean | void;
  children: React.ReactNode;
}

/**
 * A link component that supports SPA navigation on normal click,
 * while allowing ctrl+click/cmd+click/middle-click to open in a new tab.
 *
 * Use this instead of <span onClick={() => navigate(path)}> or
 * <button onClick={() => navigate(path)}> for all navigable elements.
 */
export const AppLink: React.FC<AppLinkProps> = ({
  to,
  onBeforeNavigate,
  children,
  ...props
}) => {
  const navigate = useNavigate();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Let browser handle ctrl+click, cmd+click, middle-click, shift+click
      if (!shouldHandleInternalNavigation(e)) {
        return;
      }

      // Call optional pre-navigation handler
      if (onBeforeNavigate) {
        const result = onBeforeNavigate(e);
        if (result === false) return;
      }

      e.preventDefault();
      navigate(to);
    },
    [navigate, to, onBeforeNavigate],
  );

  return (
    <a href={to} onClick={handleClick} {...props}>
      {children}
    </a>
  );
};
