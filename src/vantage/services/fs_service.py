import os
from pathlib import Path

from vantage.schemas.models import FileContent, FileNode
from vantage.services.git_service import GitService


class FileSystemService:
    def __init__(
        self,
        root_path: Path,
        exclude_dirs: frozenset[str] | None = None,
        allowed_read_roots: list[Path] | None = None,
        show_hidden: bool = True,
    ):
        from vantage.config import DEFAULT_EXCLUDE_DIRS

        self.root_path = root_path.resolve()
        self.exclude_dirs = exclude_dirs if exclude_dirs is not None else DEFAULT_EXCLUDE_DIRS
        self.allowed_read_roots = [p.resolve() for p in (allowed_read_roots or [])]
        self.show_hidden = show_hidden
        self._git: GitService | None = None

    @property
    def git(self) -> GitService:
        if self._git is None:
            self._git = GitService(self.root_path, exclude_dirs=self.exclude_dirs)
        return self._git

    def validate_path(self, path: str) -> Path:
        """Validate and resolve a path, ensuring it stays within root_path.

        Rejects:
        - Absolute paths (starting with /)
        - Null bytes
        - Paths into .git directory
        - Any resolved path outside root_path
        """
        if not path or "\x00" in path:
            raise ValueError("Invalid path")

        # Reject absolute paths outright
        if path.startswith("/"):
            raise ValueError("Absolute paths not allowed")

        # Block access to .git internals
        normalized = path.replace("\\", "/")
        parts = normalized.split("/")
        if ".git" in parts:
            raise ValueError("Access to .git directory is not allowed")

        # Normalize and resolve
        full_path = (self.root_path / path).resolve()

        # Must be root_path itself, a child of root_path, or under an allowed root
        try:
            full_path.relative_to(self.root_path)
        except ValueError:
            for allowed_root in self.allowed_read_roots:
                try:
                    full_path.relative_to(allowed_root)
                    break
                except ValueError:
                    continue
            else:
                raise ValueError("Path traversal detected") from None

        return full_path

    @staticmethod
    def _dir_has_markdown(dir_path: Path) -> bool:
        """Check if a directory (recursively) contains any .md files.

        Stops as soon as one is found for speed.
        Walks into hidden subdirectories as well.
        """
        try:
            for _dirpath, _dirnames, filenames in os.walk(dir_path):
                for fname in filenames:
                    if fname.lower().endswith(".md"):
                        return True
        except OSError:
            pass
        return False

    def list_directory(self, path: str = ".", include_git: bool = False) -> list[FileNode]:
        """List a directory's contents.

        By default returns just file/folder names (fast, no git calls).
        Set include_git=True to also fetch last_commit per entry (batch git call).
        """
        target_dir = self.validate_path(path)
        if not target_dir.is_dir():
            raise ValueError("Not a directory")

        nodes = []
        rel_paths: list[str] = []
        for entry in os.scandir(target_dir):
            is_dir = entry.is_dir()
            is_markdown = entry.name.lower().endswith(".md")

            # Skip excluded directories
            if is_dir and entry.name in self.exclude_dirs:
                continue
            # Skip hidden directories/files if configured
            if not self.show_hidden and entry.name.startswith("."):
                continue

            if is_dir:
                has_md = self._dir_has_markdown(Path(entry.path))
                rel_path = os.path.relpath(entry.path, self.root_path)
                rel_paths.append(rel_path)
                nodes.append(
                    FileNode(
                        name=entry.name,
                        path=rel_path,
                        is_dir=True,
                        has_markdown=has_md,
                        last_commit=None,
                    )
                )
            elif is_markdown:
                rel_path = os.path.relpath(entry.path, self.root_path)
                rel_paths.append(rel_path)
                nodes.append(
                    FileNode(
                        name=entry.name,
                        path=rel_path,
                        is_dir=False,
                        has_markdown=True,
                        last_commit=None,
                    )
                )

        # Batch fetch git info in a single call instead of N individual calls
        if include_git and rel_paths:
            commit_map = self.git.get_last_commits_batch(rel_paths)
            for node in nodes:
                if node.path in commit_map:
                    node.last_commit = commit_map[node.path]

        # Annotate git working-directory status (always — it's fast)
        status_map = self.git.get_working_dir_status()
        if status_map:
            for node in nodes:
                if node.is_dir:
                    # Directory contains changes if any status entry is under it
                    prefix = node.path + "/"
                    if any(p.startswith(prefix) or p == node.path for p in status_map):
                        node.git_status = "contains_changes"
                else:
                    if node.path in status_map:
                        node.git_status = status_map[node.path]

        return sorted(nodes, key=lambda x: (not x.is_dir, x.name))

    def list_all_files(self, extensions: list[str] | None = None) -> list[str]:
        """Recursively list all files under root_path, returning relative paths.

        Fast: pure filesystem walk, no git calls.
        Skips excluded directories (node_modules, .venv, etc.).
        """
        if extensions is None:
            extensions = [".md"]

        results: list[str] = []
        for dirpath, dirnames, filenames in os.walk(self.root_path):
            # Prune excluded directories and optionally hidden directories
            dirnames[:] = [
                d
                for d in dirnames
                if d not in self.exclude_dirs and (self.show_hidden or not d.startswith("."))
            ]
            for fname in filenames:
                if extensions and not any(fname.lower().endswith(ext) for ext in extensions):
                    continue
                full = os.path.join(dirpath, fname)
                rel = os.path.relpath(full, self.root_path)
                results.append(rel)

        results.sort()
        return results

    def read_file(self, path: str) -> FileContent:
        target_file = self.validate_path(path)
        if not target_file.is_file():
            raise ValueError("Not a file")

        try:
            with open(target_file, encoding="utf-8") as f:
                content = f.read()
                return FileContent(path=path, content=content, encoding="utf-8")
        except UnicodeDecodeError:
            # Simple binary detection
            return FileContent(path=path, content="", encoding="binary")
