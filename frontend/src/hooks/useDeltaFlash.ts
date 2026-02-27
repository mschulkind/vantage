import { useLayoutEffect, useRef, type RefObject } from "react";
import { diffArrays } from "diff";

const FLASH_CLASS = "animate-flash-update";

/**
 * Compares old and new DOM child snapshots, applying a flash animation
 * to elements that were added or changed.
 */
export function applyDeltaFlash(
  oldSnapshots: string[],
  newSnapshots: string[],
  children: HTMLElement[],
): boolean {
  const diff = diffArrays(oldSnapshots, newSnapshots);

  let childIndex = 0;
  let flashed = false;

  for (const part of diff) {
    if (part.added) {
      // These children are new or modified — flash them
      for (let i = 0; i < (part.count ?? 0); i++) {
        const el = children[childIndex];
        if (el) {
          el.classList.add(FLASH_CLASS);
          el.addEventListener(
            "animationend",
            () => el.classList.remove(FLASH_CLASS),
            { once: true },
          );
          flashed = true;
        }
        childIndex++;
      }
    } else if (part.removed) {
      // Old elements that no longer exist — don't advance childIndex
    } else {
      // Unchanged — skip past these children
      childIndex += part.count ?? 0;
    }
  }

  return flashed;
}

/**
 * Hook that detects which rendered markdown blocks changed between updates
 * and applies a flash animation only to the changed elements.
 *
 * Works by snapshotting each top-level child's outerHTML after every render,
 * then using diffArrays (LCS-based) to find added/changed children when
 * the content prop changes while viewing the same file.
 */
export function useDeltaFlash(
  containerRef: RefObject<HTMLElement | null>,
  content: string,
  path: string,
): void {
  const prevSnapshotsRef = useRef<string[]>([]);
  const prevPathRef = useRef<string>(path);
  const prevContentRef = useRef<string>(content);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const children = Array.from(container.children) as HTMLElement[];
    const newSnapshots = children.map((el) => el.outerHTML);

    const contentChanged = prevContentRef.current !== content;
    const sameFile = prevPathRef.current === path;

    if (contentChanged && sameFile && prevSnapshotsRef.current.length > 0) {
      applyDeltaFlash(prevSnapshotsRef.current, newSnapshots, children);
    }

    prevSnapshotsRef.current = newSnapshots;
    prevPathRef.current = path;
    prevContentRef.current = content;
  });
}
