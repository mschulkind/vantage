from fastapi import APIRouter, HTTPException

from vantage.schemas.models import FileContent, FileDiff, FileNode, GitCommit, RepoInfo, VersionInfo
from vantage.services.fs_service import FileSystemService
from vantage.services.git_service import GitService
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


@router.get("/r/{repo}/git/status", response_model=GitCommit)
async def get_status_multi(repo: str, path: str):
    git = get_git_service(repo)
    commit = git.get_last_commit(path)
    if not commit:
        raise HTTPException(status_code=404, detail="No commit found for path")
    return commit


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


@router.get("/git/status", response_model=GitCommit)
async def get_status(path: str):
    _require_single_repo_mode()
    git = get_git_service()
    commit = git.get_last_commit(path)
    if not commit:
        raise HTTPException(status_code=404, detail="No commit found for path")
    return commit


@router.get("/git/diff", response_model=FileDiff)
async def get_diff(path: str, commit: str):
    _require_single_repo_mode()
    _validate_commit_sha(commit)
    git = get_git_service()
    diff = git.get_file_diff(path, commit)
    if not diff:
        raise HTTPException(status_code=404, detail="Could not generate diff")
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
