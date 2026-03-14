"""Configuration management for multi-repo mode."""

import logging
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_CONFIG_PATH = Path("~/.config/vantage/config.toml").expanduser()

logger = logging.getLogger(__name__)

# Directories excluded from file listings and recent-files by default.
# These are common dependency / build / cache directories that should
# never surface in the UI.
DEFAULT_EXCLUDE_DIRS: frozenset[str] = frozenset(
    {
        # Version control
        ".git",
        ".hg",
        ".svn",
        # Dependencies
        "node_modules",
        ".venv",
        "venv",
        # Python caches
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".egg-info",
        ".tox",
        ".nox",
        # Build outputs
        "dist",
        "build",
        # General caches
        ".cache",
    }
)


@dataclass
class RepoConfig:
    """Configuration for a single repository."""

    name: str
    path: Path
    allowed_read_roots: list[Path] = field(default_factory=list)

    def __post_init__(self):
        if isinstance(self.path, str):
            self.path = Path(self.path).expanduser().resolve()
        self.allowed_read_roots = [Path(p).expanduser().resolve() for p in self.allowed_read_roots]


@dataclass
class DaemonConfig:
    """Configuration for daemon mode with multiple repositories."""

    repos: list[RepoConfig] = field(default_factory=list)
    source_dirs: list[Path] = field(default_factory=list)
    host: str | list[str] = "127.0.0.1"
    port: int = 8000
    exclude_dirs: frozenset[str] = DEFAULT_EXCLUDE_DIRS
    show_hidden: bool = True
    walk_max_depth: int | None = None
    walk_timeout: float = 30.0

    @classmethod
    def from_file(cls, config_path: Path | None = None) -> "DaemonConfig":
        """Load configuration from a TOML file."""
        path = config_path or DEFAULT_CONFIG_PATH
        path = Path(path).expanduser().resolve()

        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {path}")

        with open(path, "rb") as f:
            data = tomllib.load(f)

        repos = []
        for repo_data in data.get("repos", []):
            repos.append(
                RepoConfig(
                    name=repo_data["name"],
                    path=repo_data["path"],
                    allowed_read_roots=repo_data.get("allowed_read_roots", []),
                )
            )

        # Parse exclude_dirs: use explicit list if provided, otherwise defaults.
        raw_exclude = data.get("exclude_dirs")
        exclude_dirs = frozenset(raw_exclude) if raw_exclude is not None else DEFAULT_EXCLUDE_DIRS

        # Parse source_dirs for auto-discovery
        source_dirs = [Path(p).expanduser().resolve() for p in data.get("source_dirs", [])]

        config = cls(
            repos=repos,
            source_dirs=source_dirs,
            host=data.get("host", "127.0.0.1"),
            port=data.get("port", 8000),
            exclude_dirs=exclude_dirs,
            show_hidden=data.get("show_hidden", True),
            walk_max_depth=data.get("walk_max_depth"),
            walk_timeout=data.get("walk_timeout", 30.0),
        )

        if source_dirs:
            config._discover_repos_from_source_dirs()

        return config

    def _discover_repos_from_source_dirs(self) -> None:
        """Scan source_dirs for git repos and add any not already configured.

        A subdirectory is considered a repo if it contains a ``.git``
        directory or file (for worktrees).  Repos whose resolved path
        already matches an explicit ``[[repos]]`` entry are skipped.
        Names are derived from the directory name with a numeric suffix
        added if the name is already taken.
        """
        existing_paths = {repo.path.resolve() for repo in self.repos}
        existing_names = {repo.name for repo in self.repos}

        for source_dir in self.source_dirs:
            if not source_dir.is_dir():
                logger.warning("source_dir does not exist or is not a directory: %s", source_dir)
                continue

            try:
                entries = sorted(source_dir.iterdir())
            except OSError:
                logger.warning("Cannot read source_dir: %s", source_dir)
                continue

            for entry in entries:
                if not entry.is_dir():
                    continue
                if entry.name.startswith("."):
                    continue

                git_marker = entry / ".git"
                if not git_marker.exists():
                    continue

                resolved = entry.resolve()
                if resolved in existing_paths:
                    continue

                # Pick a unique name
                base_name = entry.name
                name = base_name
                counter = 2
                while name in existing_names:
                    name = f"{base_name}-{counter}"
                    counter += 1

                self.repos.append(RepoConfig(name=name, path=resolved))
                existing_paths.add(resolved)
                existing_names.add(name)
                logger.info("Auto-discovered repo: %s → %s", name, resolved)

    def validate(self) -> list[str]:
        """Validate the configuration and return a list of errors."""
        errors = []

        if not self.repos:
            errors.append("No repositories configured (add [[repos]] entries or source_dirs)")

        names = set()
        for repo in self.repos:
            if repo.name in names:
                errors.append(f"Duplicate repository name: {repo.name}")
            names.add(repo.name)

            if not repo.path.exists():
                errors.append(f"Repository path does not exist: {repo.path}")
            elif not repo.path.is_dir():
                errors.append(f"Repository path is not a directory: {repo.path}")
            for allowed in repo.allowed_read_roots:
                if not allowed.exists():
                    errors.append(
                        f"Allowed read root does not exist for repo '{repo.name}': {allowed}"
                    )
                elif not allowed.is_dir():
                    errors.append(
                        f"Allowed read root is not a directory for repo '{repo.name}': {allowed}"
                    )

        return errors

    def get_repo(self, name: str) -> RepoConfig | None:
        """Get a repository by name."""
        for repo in self.repos:
            if repo.name == name:
                return repo
        return None


def create_example_config(path: Path | None = None) -> Path:
    """Create an example configuration file."""
    path = path or DEFAULT_CONFIG_PATH
    path = Path(path).expanduser().resolve()

    path.parent.mkdir(parents=True, exist_ok=True)

    example_content = """\
# Vantage Daemon Configuration
#
# This file configures the Vantage daemon to serve multiple directories.
# Each repository will appear as a top-level item in the sidebar.

# Server settings
host = "127.0.0.1"
port = 8000

# Directories to exclude from file listings and recent files.
# These are filtered out of the sidebar, file picker, and recent files.
# Defaults (if omitted): node_modules, .venv, venv, __pycache__,
#   .pytest_cache, .mypy_cache, .ruff_cache, .egg-info, .tox, .nox,
#   dist, build, .cache, .git, .hg, .svn
#
# To override the defaults with your own list:
# exclude_dirs = ["node_modules", ".venv", "vendor"]

# Performance tuning for very large repos.
# walk_max_depth: limit how deep to scan for untracked markdown files.
#   Default: no limit (all depths scanned).
#   Set to e.g. 5 if repos have enormous deeply-nested non-markdown trees.
# walk_max_depth = 5
#
# walk_timeout: timeout in seconds for the git ls-files subprocess that
#   discovers untracked files. Default: 30 seconds.
# walk_timeout = 30.0

# Source directories: parent directories that are automatically scanned
# for git repos.  Any subdirectory containing a .git folder is added as
# a repo (using the directory name).  Repos already listed in [[repos]]
# are not duplicated.  This is off by default — uncomment to enable.
#
# source_dirs = ["~/code", "~/projects"]

# Repositories to serve
# Each repo needs a unique name (used in URLs) and a path to the directory.
#
# Example:
# [[repos]]
# name = "notes"
# path = "~/Documents/notes"
#
# [[repos]]
# name = "work"
# path = "~/work/documentation"
# allowed_read_roots = ["~/.dotfiles/gemini/skills"]

[[repos]]
name = "example"
path = "."
"""

    with open(path, "w") as f:
        f.write(example_content)

    return path
