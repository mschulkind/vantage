from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RepoInfo(BaseModel):
    """Information about a configured repository."""

    name: str


class FileNode(BaseModel):
    name: str
    path: str
    is_dir: bool
    has_markdown: bool = True
    git_status: str | None = None  # 'modified', 'added', 'deleted', 'untracked', 'contains_changes'
    last_commit: Optional["GitCommit"] = None
    children: list["FileNode"] | None = None


class GitCommit(BaseModel):
    hexsha: str
    author_name: str
    author_email: str
    date: datetime
    message: str


class FileStatus(BaseModel):
    last_commit: GitCommit | None = None
    is_modified: bool


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
