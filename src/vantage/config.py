"""Configuration management for multi-repo mode."""

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_CONFIG_PATH = Path("~/.config/vantage/config.toml").expanduser()

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
    host: str | list[str] = "127.0.0.1"
    port: int = 8000
    exclude_dirs: frozenset[str] = DEFAULT_EXCLUDE_DIRS
    show_hidden: bool = True

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

        return cls(
            repos=repos,
            host=data.get("host", "127.0.0.1"),
            port=data.get("port", 8000),
            exclude_dirs=exclude_dirs,
            show_hidden=data.get("show_hidden", True),
        )

    def validate(self) -> list[str]:
        """Validate the configuration and return a list of errors."""
        errors = []

        if not self.repos:
            errors.append("No repositories configured")

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
