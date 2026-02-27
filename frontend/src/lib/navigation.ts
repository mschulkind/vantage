/**
 * Determines if a click event should be handled as internal SPA navigation.
 * Returns false if the user is trying to open a link in a new tab/window
 * (via Ctrl+click, Cmd+click, Shift+click, or middle mouse button).
 */
export function shouldHandleInternalNavigation(
  event: MouseEvent | React.MouseEvent,
): boolean {
  // Middle mouse button or right click should not be intercepted
  if (event.button !== 0) {
    return false;
  }

  // Modifier keys indicate user wants to open in new tab/window
  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  return true;
}
