import asyncio
import logging
import time
from pathlib import Path

from watchfiles import Change, DefaultFilter, awatch

from vantage.services.socket_manager import manager
from vantage.settings import get_daemon_config, settings

logger = logging.getLogger(__name__)

# Extensions we care about for live-reload
_WATCHED_EXTENSIONS = {".md"}

# Git internal files whose changes indicate repo state change (commit,
# merge, checkout, rebase, etc.).  Watching these lets us refresh the
# "recently changed" list after ``git commit`` even though no ``.md``
# file content actually changed on disk.
_GIT_STATE_FILES = {"index", "HEAD", "MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD"}

# Quiet period: wait this long after last change before broadcasting,
# to coalesce rapid bursts like git branch switches.
_QUIET_PERIOD_S = 0.1
# Maximum time before forced broadcast even if changes keep arriving.
_MAX_WAIT_S = 1.0


class _GitAwareFilter(DefaultFilter):
    """Extends the default watchfiles filter to allow git state-file changes.

    ``DefaultFilter`` excludes the entire ``.git/`` tree.  We override
    ``__call__`` to let through a small set of top-level state files
    (e.g. ``index``, ``HEAD``) that change on commits, branch switches,
    rebases, etc.  The rest of ``.git/`` (objects, refs, logs, …) remains
    filtered to avoid noise.
    """

    def __call__(self, change: Change, path: str) -> bool:
        # Fast path: let the default filter handle non-.git paths
        parts = path.replace("\\", "/").split("/")
        # Check if any path component is ".git"
        try:
            git_idx = next(i for i, p in enumerate(parts) if p == ".git")
        except StopIteration:
            return super().__call__(change, path)
        # Allow .git/<state_file> (exactly one level deep); reject rest.
        return len(parts) == git_idx + 2 and parts[-1] in _GIT_STATE_FILES


def _is_relevant(path: str) -> bool:
    """Check if a changed file is relevant for live-reload."""
    lower = path.lower()
    if any(lower.endswith(ext) for ext in _WATCHED_EXTENSIONS):
        return True
    # Detect git state changes (commits, branch switches, etc.)
    parts = path.replace("\\", "/").split("/")
    return len(parts) >= 2 and parts[0] == ".git" and parts[-1] in _GIT_STATE_FILES


def _is_git_state_change(path: str) -> bool:
    """Return True if the path is a git state file (not a .md content change)."""
    parts = path.replace("\\", "/").split("/")
    return len(parts) >= 2 and parts[0] == ".git" and parts[-1] in _GIT_STATE_FILES


async def _coalesce_and_broadcast(
    pending: set[str],
    repo_name: str | None = None,
) -> None:
    """Send a single batched message for accumulated paths."""
    if not pending:
        return

    # Always invalidate git-status cache on any file change — working
    # directory status reflects file state, not just git state.
    from vantage.services.fs_service import clear_md_dir_cache
    from vantage.services.git_service import clear_recent_files_cache, clear_status_cache

    clear_status_cache()

    # If a .md file was added or removed, clear the dir-has-markdown cache
    if any(p.lower().endswith(".md") for p in pending):
        clear_md_dir_cache()

    # If any pending path is a git state file, also invalidate the
    # recent-files cache so the next API call returns fresh data.
    has_git_change = any(_is_git_state_change(p) for p in pending)
    if has_git_change:
        clear_recent_files_cache()
        logger.debug("Cleared recent-files + git-status caches due to git state change")

    unique_paths = sorted(pending)
    msg: dict[str, object] = {"type": "files_changed", "paths": unique_paths}
    if repo_name:
        msg["repo"] = repo_name
        logger.info(f"Batch ({repo_name}): {len(unique_paths)} file(s) changed")
    else:
        logger.info(f"Batch: {len(unique_paths)} file(s) changed")
    logger.debug("Changed paths: %s", unique_paths)
    await manager.broadcast(msg)


async def watch_repo():
    """Watch single repo (legacy mode) with quiet-period coalescing."""
    # Yield to event loop so uvicorn can signal startup complete
    # before the potentially slow awatch() inotify initialization.
    await asyncio.sleep(0)
    logger.info(f"Starting watcher for {settings.target_repo}")
    target = settings.target_repo.resolve()

    pending: set[str] = set()
    quiet_task: asyncio.Task[None] | None = None
    batch_start: float | None = None

    async def flush() -> None:
        nonlocal batch_start
        paths = set(pending)
        pending.clear()
        batch_start = None
        await _coalesce_and_broadcast(paths)

    logger.info("Initializing file watcher...")
    t0 = time.monotonic()
    async for changes in awatch(target, watch_filter=_GitAwareFilter()):
        if t0 is not None:
            logger.info("[startup] file watcher ready (%.0fms)", (time.monotonic() - t0) * 1000)
            t0 = None
        for _change, abs_path in changes:
            try:
                rel_path = str(Path(abs_path).relative_to(target))
            except ValueError:
                continue
            if _is_relevant(rel_path):
                pending.add(rel_path)

        if not pending:
            continue

        now = asyncio.get_event_loop().time()
        if batch_start is None:
            batch_start = now

        # Cancel previous quiet-period timer
        if quiet_task and not quiet_task.done():
            quiet_task.cancel()

        # If we've been accumulating too long, flush now
        if now - batch_start >= _MAX_WAIT_S:
            await flush()
        else:
            # Wait for quiet period before flushing
            async def _delayed_flush() -> None:
                await asyncio.sleep(_QUIET_PERIOD_S)
                await flush()

            quiet_task = asyncio.create_task(_delayed_flush())


async def watch_multi_repo():
    """Watch multiple repos (daemon mode) with quiet-period coalescing."""
    # Yield to event loop so uvicorn can signal startup complete
    # before the potentially slow awatch() inotify initialization.
    await asyncio.sleep(0)
    daemon_config = get_daemon_config()
    if not daemon_config:
        await watch_repo()
        return

    watch_paths = []
    path_to_repo: dict[str, str] = {}
    for repo in daemon_config.repos:
        resolved = repo.path.resolve()
        watch_paths.append(resolved)
        path_to_repo[str(resolved)] = repo.name
        logger.info(f"Starting watcher for repo '{repo.name}' at {resolved}")

    pending: dict[str, set[str]] = {}  # repo_name -> paths
    quiet_task: asyncio.Task[None] | None = None
    batch_start: float | None = None

    async def flush() -> None:
        nonlocal batch_start
        snapshot = {k: set(v) for k, v in pending.items()}
        pending.clear()
        batch_start = None
        for repo_name, paths in snapshot.items():
            await _coalesce_and_broadcast(paths, repo_name)

    logger.info("Initializing file watchers for %d repos...", len(watch_paths))
    t0 = time.monotonic()
    async for changes in awatch(*watch_paths, watch_filter=_GitAwareFilter()):
        if t0 is not None:
            logger.info("[startup] file watchers ready (%.0fms)", (time.monotonic() - t0) * 1000)
            t0 = None
        for _change, abs_path in changes:
            abs_path_obj = Path(abs_path)
            for repo_path_str, name in path_to_repo.items():
                repo_path = Path(repo_path_str)
                try:
                    rel_path = str(abs_path_obj.relative_to(repo_path))
                except ValueError:
                    continue
                if _is_relevant(rel_path):
                    pending.setdefault(name, set()).add(rel_path)
                break

        if not pending:
            continue

        now = asyncio.get_event_loop().time()
        if batch_start is None:
            batch_start = now

        if quiet_task and not quiet_task.done():
            quiet_task.cancel()

        if now - batch_start >= _MAX_WAIT_S:
            await flush()
        else:

            async def _delayed_flush() -> None:
                await asyncio.sleep(_QUIET_PERIOD_S)
                await flush()

            quiet_task = asyncio.create_task(_delayed_flush())
