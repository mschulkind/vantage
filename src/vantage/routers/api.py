import asyncio
import logging
import time
from functools import partial

from fastapi import APIRouter, HTTPException

from vantage.schemas.models import (
    FileContent,
    FileDiff,
    FileNode,
    FileStatus,
    GitCommit,
    JJEvoEntry,
    JJInfo,
    JJRevision,
    RepoInfo,
    ReviewData,
    VersionInfo,
)
from vantage.services.fs_service import FileSystemService
from vantage.services.git_service import GitService
from vantage.services.jj_service import JJService
from vantage.settings import get_daemon_config, settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Cache for repo last_activity to make /api/repos instant.
# Warmed on startup; refreshed in background periodically and on watcher events.
_repo_activity_cache: dict[str, RepoInfo] = {}
_repo_activity_cache_time: float = 0.0
_REPO_ACTIVITY_TTL = 30.0  # seconds before background refresh


def get_fs_service(
    repo: str | None = None, *, show_hidden: bool | None = None, show_gitignored: bool | None = None
):
    """Get FileSystemService for the specified repo or default.

    In daemon mode, a repo name is required.  Falling back to
    settings.target_repo would serve CWD, which is a security risk.
    """
    hidden = show_hidden if show_hidden is not None else settings.show_hidden
    gitignored = show_gitignored if show_gitignored is not None else True
    daemon_config = get_daemon_config()
    if daemon_config:
        if not repo:
            raise HTTPException(
                status_code=400,
                detail="Repository name is required in multi-repo mode",
            )
        repo_config = daemon_config.get_repo(repo)
        if not repo_config:
            raise HTTPException(status_code=404, detail=f"Repository not found: {repo}")
        return FileSystemService(
            repo_config.path,
            exclude_dirs=settings.exclude_dirs,
            allowed_read_roots=repo_config.allowed_read_roots,
            show_hidden=hidden,
            show_gitignored=gitignored,
        )
    return FileSystemService(
        settings.target_repo,
        exclude_dirs=settings.exclude_dirs,
        show_hidden=hidden,
        show_gitignored=gitignored,
    )


def get_git_service(repo: str | None = None):
    """Get GitService for the specified repo or default.

    In daemon mode, a repo name is required.
    """
    daemon_config = get_daemon_config()
    if daemon_config:
        if not repo:
            raise HTTPException(
                status_code=400,
                detail="Repository name is required in multi-repo mode",
            )
        repo_config = daemon_config.get_repo(repo)
        if not repo_config:
            raise HTTPException(status_code=404, detail=f"Repository not found: {repo}")
        return GitService(repo_config.path, exclude_dirs=settings.exclude_dirs)
    return GitService(settings.target_repo, exclude_dirs=settings.exclude_dirs)


def get_jj_service(repo: str | None = None) -> JJService:
    """Get JJService for the specified repo or default."""
    from pathlib import Path

    daemon_config = get_daemon_config()
    if daemon_config:
        if not repo:
            raise HTTPException(
                status_code=400,
                detail="Repository name is required in multi-repo mode",
            )
        repo_config = daemon_config.get_repo(repo)
        if not repo_config:
            raise HTTPException(status_code=404, detail=f"Repository not found: {repo}")
        return JJService(Path(repo_config.path))
    return JJService(Path(settings.target_repo))


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/version", response_model=VersionInfo)
async def get_version():
    """Get version information for the Vantage instance.

    Returns the current HEAD commit hash and whether the working directory
    has uncommitted changes.
    """
    git = get_git_service()
    commit_hash = git.get_head_commit_hash() or "unknown"
    is_dirty = git.is_working_dir_dirty()
    return VersionInfo(commit_hash=commit_hash, is_dirty=is_dirty)


@router.get("/repos", response_model=list[RepoInfo])
async def list_repos():
    """List all configured repositories (multi-repo mode only).

    Returns instantly from cache.  Cache is warmed on startup and
    refreshed in the background every 60 seconds.
    """
    global _repo_activity_cache, _repo_activity_cache_time

    daemon_config = get_daemon_config()
    if not daemon_config:
        # Single repo mode - return single repo info
        return [RepoInfo(name="")]

    # Return from cache if available (even if stale — freshness is
    # handled by the background refresh task).
    if _repo_activity_cache:
        return list(_repo_activity_cache.values())

    # First call before cache is ready (shouldn't happen if warmup ran,
    # but handle gracefully): return names instantly, timestamps arrive later.
    return [RepoInfo(name=r.name) for r in daemon_config.repos]


async def _compute_repo_activity() -> dict[str, RepoInfo]:
    """Compute last_activity for all repos.  Runs in thread pool."""
    daemon_config = get_daemon_config()
    if not daemon_config:
        return {}

    loop = asyncio.get_running_loop()

    async def _get_last_activity(repo_cfg) -> RepoInfo:
        try:

            def _newest_file_date():
                """Get last activity date via a single lightweight git command."""
                import subprocess
                from datetime import UTC, datetime

                try:
                    proc = subprocess.run(
                        ["git", "log", "-1", "--format=%ct"],
                        capture_output=True,
                        text=True,
                        cwd=str(repo_cfg.path),
                        timeout=5,
                    )
                    if proc.returncode == 0 and proc.stdout.strip():
                        return datetime.fromtimestamp(int(proc.stdout.strip()), tz=UTC)
                except Exception:
                    pass
                return None

            t0 = time.monotonic()
            last = await loop.run_in_executor(None, _newest_file_date)
            elapsed = (time.monotonic() - t0) * 1000
            if elapsed > 200:
                logger.info("[startup] repo '%s' activity query: %.0fms", repo_cfg.name, elapsed)
            else:
                logger.debug("[startup] repo '%s' activity query: %.0fms", repo_cfg.name, elapsed)
            return RepoInfo(name=repo_cfg.name, last_activity=last)
        except Exception:
            logger.exception("[startup] repo '%s' activity query failed", repo_cfg.name)
            return RepoInfo(name=repo_cfg.name)

    results = await asyncio.gather(*[_get_last_activity(r) for r in daemon_config.repos])
    return {r.name: r for r in results}


async def warm_repo_cache() -> None:
    """Warm the repo activity cache.  Called during app startup."""
    global _repo_activity_cache, _repo_activity_cache_time
    t0 = time.monotonic()
    _repo_activity_cache = await _compute_repo_activity()
    _repo_activity_cache_time = time.monotonic()
    elapsed = _repo_activity_cache_time - t0
    logger.info("Repo activity cache warmed: %d repos in %.1fs", len(_repo_activity_cache), elapsed)


async def refresh_repo_cache_loop() -> None:
    """Background task that periodically refreshes repo activity cache.

    Also re-scans source_dirs for newly cloned/created projects so they
    appear without restarting the daemon.
    """
    while True:
        await asyncio.sleep(_REPO_ACTIVITY_TTL)
        try:
            daemon_config = get_daemon_config()
            if daemon_config and daemon_config.source_dirs:
                new_repos = daemon_config._discover_repos_from_source_dirs()
                if new_repos:
                    logger.info(
                        "Discovered %d new repo(s): %s",
                        len(new_repos),
                        ", ".join(r.name for r in new_repos),
                    )
                    # Restart the file watcher so new repos get live-reload
                    from vantage.services.watcher import signal_watcher_restart

                    signal_watcher_restart()

            await warm_repo_cache()
        except Exception:
            logger.exception("Failed to refresh repo activity cache")


@router.get("/files/all")
async def list_all_files_global():
    """List all files across all repositories."""
    daemon_config = get_daemon_config()
    if not daemon_config:
        # Single-repo mode: return files with empty repo name
        fs = get_fs_service()
        return [{"repo": "", "path": p} for p in fs.list_all_files()]

    loop = asyncio.get_running_loop()

    async def _get_files(repo_cfg):
        fs = FileSystemService(
            repo_cfg.path,
            exclude_dirs=settings.exclude_dirs,
            show_hidden=settings.show_hidden,
        )
        files = await loop.run_in_executor(None, fs.list_all_files)
        return [{"repo": repo_cfg.name, "path": p} for p in files]

    results = await asyncio.gather(*[_get_files(r) for r in daemon_config.repos])
    # Flatten list of lists
    return [item for sublist in results for item in sublist]


@router.get("/recent/all")
async def get_recent_files_global(
    limit: int = 10, show_hidden: bool = True, show_gitignored: bool = True
):
    """Get recently changed files across all repositories."""
    daemon_config = get_daemon_config()
    limit = min(max(limit, 1), 1000)

    if not daemon_config:
        # Single-repo mode
        git = get_git_service()
        loop = asyncio.get_running_loop()
        files = await loop.run_in_executor(
            None,
            partial(
                git.get_recently_changed_files,
                limit=limit,
                show_hidden=show_hidden,
                show_gitignored=show_gitignored,
            ),
        )
        return [{"repo": "", **f} for f in files]

    loop = asyncio.get_running_loop()

    async def _get_recent(repo_cfg):
        git = GitService(repo_cfg.path, exclude_dirs=settings.exclude_dirs)
        files = await loop.run_in_executor(
            None,
            partial(
                git.get_recently_changed_files,
                limit=limit,
                show_hidden=show_hidden,
                show_gitignored=show_gitignored,
            ),
        )
        return [{"repo": repo_cfg.name, **f} for f in files]

    results = await asyncio.gather(*[_get_recent(r) for r in daemon_config.repos])
    # Flatten and sort by date descending, take top `limit`
    all_files = [item for sublist in results for item in sublist]
    all_files.sort(key=lambda x: x.get("date", ""), reverse=True)
    return all_files[:limit]


# Multi-repo endpoints (when running in daemon mode)
@router.get("/r/{repo}/tree", response_model=list[FileNode])
async def get_tree_multi(
    repo: str,
    path: str = ".",
    include_git: bool = False,
    show_hidden: bool = True,
    show_gitignored: bool = True,
):
    fs = get_fs_service(repo, show_hidden=show_hidden, show_gitignored=show_gitignored)
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None, partial(fs.list_directory, path, include_git=include_git)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None


@router.get("/r/{repo}/content", response_model=FileContent)
async def get_content_multi(repo: str, path: str):
    fs = get_fs_service(repo)
    try:
        return fs.read_file(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None


@router.get("/r/{repo}/git/history", response_model=list[GitCommit])
async def get_history_multi(repo: str, path: str):
    git = get_git_service(repo)
    return git.get_history(path)


@router.get("/r/{repo}/git/status", response_model=FileStatus)
async def get_status_multi(repo: str, path: str):
    git = get_git_service(repo)
    loop = asyncio.get_running_loop()

    def _get_status() -> FileStatus:
        commit = git.get_last_commit(path)
        wd_status = git.get_working_dir_status()
        return FileStatus(last_commit=commit, git_status=wd_status.get(path))

    return await loop.run_in_executor(None, _get_status)


def _validate_commit_sha(sha: str) -> None:
    """Validate that a commit SHA looks like a hex string."""
    import re

    if not re.fullmatch(r"[0-9a-fA-F]{4,40}", sha):
        raise HTTPException(status_code=400, detail="Invalid commit SHA")


@router.get("/r/{repo}/git/diff", response_model=FileDiff)
async def get_diff_multi(repo: str, path: str, commit: str):
    _validate_commit_sha(commit)
    git = get_git_service(repo)
    diff = git.get_file_diff(path, commit)
    if not diff:
        raise HTTPException(status_code=404, detail="Could not generate diff")
    return diff


@router.get("/r/{repo}/git/diff/working", response_model=FileDiff)
async def get_working_diff_multi(repo: str, path: str):
    git = get_git_service(repo)
    diff = git.get_working_dir_diff(path)
    if not diff:
        raise HTTPException(status_code=404, detail="No uncommitted changes for this file")
    return diff


@router.get("/r/{repo}/git/recent")
async def get_recent_files_multi(
    repo: str,
    limit: int = 10,
    show_hidden: bool = True,
    show_gitignored: bool = True,
):
    git = get_git_service(repo)
    limit = min(max(limit, 1), 1000)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        partial(
            git.get_recently_changed_files,
            limit=limit,
            show_hidden=show_hidden,
            show_gitignored=show_gitignored,
        ),
    )


@router.get("/r/{repo}/info")
async def get_repo_info_multi(repo: str):
    git = get_git_service(repo)
    return {"name": git.get_repo_name(), "root_path": str(git.repo_path)}


@router.get("/r/{repo}/files", response_model=list[str])
async def list_all_files_multi(repo: str):
    fs = get_fs_service(repo)
    return fs.list_all_files()


@router.get("/r/{repo}/version", response_model=VersionInfo)
async def get_version_multi(repo: str):
    """Get version information for a specific repository.

    Returns the current HEAD commit hash and whether the working directory
    has uncommitted changes.
    """
    git = get_git_service(repo)
    commit_hash = git.get_head_commit_hash() or "unknown"
    is_dirty = git.is_working_dir_dirty()
    return VersionInfo(commit_hash=commit_hash, is_dirty=is_dirty)


def _require_single_repo_mode() -> None:
    """Raise 404 if running in daemon/multi-repo mode.

    Legacy endpoints must not serve files from the default target_repo
    (which is CWD) when the server is in multi-repo mode.
    """
    if settings.multi_repo:
        raise HTTPException(
            status_code=404,
            detail="Legacy endpoints are disabled in multi-repo mode. Use /api/r/{repo}/... instead.",
        )


# Legacy single-repo endpoints (backward compatibility)
@router.get("/tree", response_model=list[FileNode])
async def get_tree(
    path: str = ".",
    include_git: bool = False,
    show_hidden: bool = True,
    show_gitignored: bool = True,
):
    _require_single_repo_mode()
    fs = get_fs_service(show_hidden=show_hidden, show_gitignored=show_gitignored)
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None, partial(fs.list_directory, path, include_git=include_git)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None


@router.get("/content", response_model=FileContent)
async def get_content(path: str):
    _require_single_repo_mode()
    fs = get_fs_service()
    try:
        return fs.read_file(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None


@router.get("/git/history", response_model=list[GitCommit])
async def get_history(path: str):
    _require_single_repo_mode()
    git = get_git_service()
    return git.get_history(path)


@router.get("/git/status", response_model=FileStatus)
async def get_status(path: str):
    _require_single_repo_mode()
    git = get_git_service()
    loop = asyncio.get_running_loop()

    def _get_status() -> FileStatus:
        commit = git.get_last_commit(path)
        wd_status = git.get_working_dir_status()
        return FileStatus(last_commit=commit, git_status=wd_status.get(path))

    return await loop.run_in_executor(None, _get_status)


@router.get("/git/diff", response_model=FileDiff)
async def get_diff(path: str, commit: str):
    _require_single_repo_mode()
    _validate_commit_sha(commit)
    git = get_git_service()
    diff = git.get_file_diff(path, commit)
    if not diff:
        raise HTTPException(status_code=404, detail="Could not generate diff")
    return diff


@router.get("/git/diff/working", response_model=FileDiff)
async def get_working_diff(path: str):
    _require_single_repo_mode()
    git = get_git_service()
    diff = git.get_working_dir_diff(path)
    if not diff:
        raise HTTPException(status_code=404, detail="No uncommitted changes for this file")
    return diff


@router.get("/git/recent")
async def get_recent_files(limit: int = 10, show_hidden: bool = True, show_gitignored: bool = True):
    _require_single_repo_mode()
    limit = min(max(limit, 1), 1000)
    git = get_git_service()
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        partial(
            git.get_recently_changed_files,
            limit=limit,
            show_hidden=show_hidden,
            show_gitignored=show_gitignored,
        ),
    )


@router.get("/info")
async def get_repo_info():
    _require_single_repo_mode()
    git = get_git_service()
    return {"name": git.get_repo_name(), "root_path": str(git.repo_path)}


@router.get("/files", response_model=list[str])
async def list_all_files():
    _require_single_repo_mode()
    fs = get_fs_service()
    return fs.list_all_files()


# --- jj (Jujutsu) endpoints ---


@router.get("/r/{repo}/jj/info", response_model=JJInfo)
async def get_jj_info_multi(repo: str):
    jj = get_jj_service(repo)
    return jj.get_info()


@router.get("/r/{repo}/jj/log", response_model=list[JJRevision])
async def get_jj_log_multi(repo: str, path: str | None = None, limit: int = 50):
    jj = get_jj_service(repo)
    return jj.get_log(path=path, limit=min(max(limit, 1), 200))


@router.get("/r/{repo}/jj/evolog", response_model=list[JJEvoEntry])
async def get_jj_evolog_multi(repo: str, rev: str = "@", limit: int = 20):
    jj = get_jj_service(repo)
    return jj.get_evolog(rev=rev, limit=min(max(limit, 1), 100))


@router.get("/r/{repo}/jj/diff", response_model=FileDiff)
async def get_jj_diff_multi(repo: str, rev: str, path: str | None = None):
    jj = get_jj_service(repo)
    diff = jj.get_diff(rev=rev, path=path)
    if not diff:
        raise HTTPException(status_code=404, detail="Could not generate jj diff")
    return diff


@router.get("/jj/info", response_model=JJInfo)
async def get_jj_info():
    _require_single_repo_mode()
    jj = get_jj_service()
    return jj.get_info()


@router.get("/jj/log", response_model=list[JJRevision])
async def get_jj_log(path: str | None = None, limit: int = 50):
    _require_single_repo_mode()
    jj = get_jj_service()
    return jj.get_log(path=path, limit=min(max(limit, 1), 200))


@router.get("/jj/evolog", response_model=list[JJEvoEntry])
async def get_jj_evolog(rev: str = "@", limit: int = 20):
    _require_single_repo_mode()
    jj = get_jj_service()
    return jj.get_evolog(rev=rev, limit=min(max(limit, 1), 100))


@router.get("/jj/diff", response_model=FileDiff)
async def get_jj_diff(rev: str, path: str | None = None):
    _require_single_repo_mode()
    jj = get_jj_service()
    diff = jj.get_diff(rev=rev, path=path)
    if not diff:
        raise HTTPException(status_code=404, detail="Could not generate jj diff")
    return diff


@router.get("/r/{repo}/jj/interdiff", response_model=FileDiff)
async def get_jj_interdiff_multi(repo: str, from_rev: str, to_rev: str, path: str | None = None):
    jj = get_jj_service(repo)
    diff = jj.get_interdiff(from_rev=from_rev, to_rev=to_rev, path=path)
    if not diff:
        raise HTTPException(status_code=404, detail="No changes between these revisions")
    return diff


@router.get("/jj/interdiff", response_model=FileDiff)
async def get_jj_interdiff(from_rev: str, to_rev: str, path: str | None = None):
    _require_single_repo_mode()
    jj = get_jj_service()
    diff = jj.get_interdiff(from_rev=from_rev, to_rev=to_rev, path=path)
    if not diff:
        raise HTTPException(status_code=404, detail="No changes between these revisions")
    return diff


# --- Performance diagnostics ---


@router.get("/perf/diagnostics")
async def get_perf_diagnostics(include_shape: bool = False):
    """Return anonymized performance diagnostics.

    Safe to share — contains only timing data and aggregate repo shape
    statistics. No file names, paths, or content are included.

    Set include_shape=true to add repo shape stats (slow for large repos).
    """
    import asyncio

    from vantage.services.perf import collect_repo_shape, perf_store

    loop = asyncio.get_running_loop()

    # Build diagnostics in thread pool so aggregation doesn't block event loop
    result = await loop.run_in_executor(None, perf_store.build_diagnostics)

    if include_shape:
        repo_shapes: dict = {}
        daemon_cfg = get_daemon_config()
        if daemon_cfg:
            for i, repo_cfg in enumerate(daemon_cfg.repos):
                shape = await loop.run_in_executor(None, collect_repo_shape, str(repo_cfg.path))
                repo_shapes[f"repo_{i + 1}"] = shape
        else:
            shape = await loop.run_in_executor(None, collect_repo_shape, str(settings.target_repo))
            repo_shapes["repo_1"] = shape
        result["repo_shape"] = repo_shapes

    return result


# --- Review mode endpoints ---


@router.get("/r/{repo}/review", response_model=ReviewData | None)
async def get_review_multi(repo: str, path: str):
    from vantage.services.review_service import get_review

    return get_review(path, repo=repo)


@router.put("/r/{repo}/review")
async def save_review_multi(repo: str, path: str, data: ReviewData):
    from vantage.services.review_service import save_review

    save_review(path, data, repo=repo)
    return {"status": "ok"}


@router.delete("/r/{repo}/review")
async def delete_review_multi(repo: str, path: str):
    from vantage.services.review_service import delete_review

    deleted = delete_review(path, repo=repo)
    if not deleted:
        raise HTTPException(status_code=404, detail="No review found")
    return {"status": "ok"}


@router.get("/review", response_model=ReviewData | None)
async def get_review_single(path: str):
    from vantage.services.review_service import get_review

    return get_review(path)


@router.put("/review")
async def save_review_single(path: str, data: ReviewData):
    from vantage.services.review_service import save_review

    save_review(path, data)
    return {"status": "ok"}


@router.delete("/review")
async def delete_review_single(path: str):
    from vantage.services.review_service import delete_review

    deleted = delete_review(path)
    if not deleted:
        raise HTTPException(status_code=404, detail="No review found")
    return {"status": "ok"}


@router.post("/perf/reset")
async def reset_perf_data():
    """Clear all collected performance data."""
    from vantage.services.perf import perf_store

    perf_store.clear()
    return {"status": "cleared"}
