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
    VersionInfo,
)
from vantage.services.fs_service import FileSystemService
from vantage.services.git_service import GitService
from vantage.services.jj_service import JJService
from vantage.settings import get_daemon_config, settings

router = APIRouter()


def get_fs_service(repo: str | None = None):
    """Get FileSystemService for the specified repo or default.

    In daemon mode, a repo name is required.  Falling back to
    settings.target_repo would serve CWD, which is a security risk.
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
        return FileSystemService(
            repo_config.path,
            exclude_dirs=settings.exclude_dirs,
            allowed_read_roots=repo_config.allowed_read_roots,
            show_hidden=settings.show_hidden,
        )
    return FileSystemService(
        settings.target_repo,
        exclude_dirs=settings.exclude_dirs,
        show_hidden=settings.show_hidden,
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
    """List all configured repositories (multi-repo mode only)."""
    daemon_config = get_daemon_config()
    if not daemon_config:
        # Single repo mode - return single repo info
        return [RepoInfo(name="")]
    return [RepoInfo(name=r.name) for r in daemon_config.repos]


# Multi-repo endpoints (when running in daemon mode)
@router.get("/r/{repo}/tree", response_model=list[FileNode])
async def get_tree_multi(repo: str, path: str = ".", include_git: bool = False):
    fs = get_fs_service(repo)
    try:
        return fs.list_directory(path, include_git=include_git)
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
    commit = git.get_last_commit(path)
    wd_status = git.get_working_dir_status()
    return FileStatus(last_commit=commit, git_status=wd_status.get(path))


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
async def get_recent_files_multi(repo: str, limit: int = 10):
    git = get_git_service(repo)
    return git.get_recently_changed_files(limit=limit)


@router.get("/r/{repo}/info")
async def get_repo_info_multi(repo: str):
    git = get_git_service(repo)
    return {"name": git.get_repo_name()}


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
async def get_tree(path: str = ".", include_git: bool = False):
    _require_single_repo_mode()
    fs = get_fs_service()
    try:
        return fs.list_directory(path, include_git=include_git)
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
    commit = git.get_last_commit(path)
    wd_status = git.get_working_dir_status()
    return FileStatus(last_commit=commit, git_status=wd_status.get(path))


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
async def get_recent_files(limit: int = 10):
    _require_single_repo_mode()
    limit = min(max(limit, 1), 1000)
    git = get_git_service()
    return git.get_recently_changed_files(limit=limit)


@router.get("/info")
async def get_repo_info():
    _require_single_repo_mode()
    git = get_git_service()
    return {"name": git.get_repo_name()}


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


@router.post("/perf/reset")
async def reset_perf_data():
    """Clear all collected performance data."""
    from vantage.services.perf import perf_store

    perf_store.clear()
    return {"status": "cleared"}
