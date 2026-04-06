from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RepoInfo(BaseModel):
    """Information about a configured repository."""

    name: str
    last_activity: datetime | None = None


class FileNode(BaseModel):
    name: str
    path: str
    is_dir: bool
    has_markdown: bool = True
    git_status: str | None = None  # 'modified', 'added', 'deleted', 'untracked', 'contains_changes'
    last_commit: Optional["GitCommit"] = None
    children: list["FileNode"] | None = None
    is_symlink: bool = False
    symlink_target: str | None = None  # relative path to target (None = broken/external)


class GitCommit(BaseModel):
    hexsha: str
    author_name: str
    author_email: str
    date: datetime
    message: str


class FileStatus(BaseModel):
    last_commit: GitCommit | None = None
    git_status: str | None = None  # 'modified', 'added', 'deleted', 'untracked', or None (clean)


class FileContent(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"


class DiffLine(BaseModel):
    type: str  # 'add', 'delete', 'context', 'header'
    content: str
    old_line_no: int | None = None
    new_line_no: int | None = None


class DiffHunk(BaseModel):
    header: str
    lines: list[DiffLine]


class FileDiff(BaseModel):
    commit_hexsha: str
    commit_message: str
    commit_author: str
    commit_date: datetime
    file_path: str
    hunks: list[DiffHunk]
    raw_diff: str


class VersionInfo(BaseModel):
    """Version information about the running Vantage instance."""

    commit_hash: str
    is_dirty: bool


class JJRevision(BaseModel):
    """A jj revision (change)."""

    change_id: str  # Short change ID (e.g., "wosnyxlu")
    commit_id: str  # Full commit hash
    description: str
    author: str
    timestamp: datetime
    bookmarks: list[str] = []
    is_working_copy: bool = False


class JJEvoEntry(BaseModel):
    """An entry in a jj evolution log (evolog)."""

    commit_id: str
    description: str
    author: str
    timestamp: datetime
    operation: str  # What operation caused this evolution
    hidden: bool = False


class JJInfo(BaseModel):
    """Information about jj status in a repository."""

    is_jj: bool
    working_copy_change_id: str | None = None


# --- Review mode models ---


class ReviewSnapshot(BaseModel):
    id: str
    content: str
    timestamp: float  # epoch seconds


class ReviewComment(BaseModel):
    id: str
    selected_text: str
    comment: str
    created_at: float  # epoch seconds
    resolved: bool = False


class ReviewData(BaseModel):
    file_path: str
    snapshots: list[ReviewSnapshot] = []
    comments: list[ReviewComment] = []
