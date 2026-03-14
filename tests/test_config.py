"""Tests for DaemonConfig, including source_dirs auto-discovery."""

import subprocess
import textwrap
from pathlib import Path

import pytest

from vantage.config import DaemonConfig


@pytest.fixture
def config_dir(tmp_path: Path) -> Path:
    """Create a temp directory with a config file and some repos."""
    return tmp_path


def _write_config(config_dir: Path, toml_content: str) -> Path:
    config_file = config_dir / "config.toml"
    config_file.write_text(textwrap.dedent(toml_content))
    return config_file


def _make_git_repo(parent: Path, name: str) -> Path:
    """Create a minimal git repo directory."""
    repo = parent / name
    repo.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "init", "--initial-branch=main"],
        cwd=repo,
        capture_output=True,
        check=True,
    )
    return repo


class TestSourceDirs:
    def test_no_source_dirs_by_default(self, config_dir: Path):
        """source_dirs is empty when not specified."""
        repo = _make_git_repo(config_dir, "myrepo")
        cfg_file = _write_config(
            config_dir,
            f"""\
            [[repos]]
            name = "myrepo"
            path = "{repo}"
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        assert cfg.source_dirs == []
        assert len(cfg.repos) == 1

    def test_discovers_git_repos(self, config_dir: Path):
        """source_dirs scans for subdirectories with .git."""
        source = config_dir / "code"
        source.mkdir()
        _make_git_repo(source, "alpha")
        _make_git_repo(source, "beta")
        # Non-git directory should be ignored
        (source / "not-a-repo").mkdir()

        cfg_file = _write_config(
            config_dir,
            f"""\
            source_dirs = ["{source}"]
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        names = {r.name for r in cfg.repos}
        assert "alpha" in names
        assert "beta" in names
        assert "not-a-repo" not in names
        assert len(cfg.repos) == 2

    def test_skips_duplicate_paths(self, config_dir: Path):
        """Manually configured repos are not duplicated by source_dirs."""
        source = config_dir / "code"
        source.mkdir()
        repo_path = _make_git_repo(source, "myproject")

        cfg_file = _write_config(
            config_dir,
            f"""\
            source_dirs = ["{source}"]

            [[repos]]
            name = "myproject"
            path = "{repo_path}"
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        # Should have exactly 1, not 2
        assert len(cfg.repos) == 1
        assert cfg.repos[0].name == "myproject"

    def test_skips_duplicate_paths_different_name(self, config_dir: Path):
        """Even if the manual name differs, same path is not added twice."""
        source = config_dir / "code"
        source.mkdir()
        repo_path = _make_git_repo(source, "myproject")

        cfg_file = _write_config(
            config_dir,
            f"""\
            source_dirs = ["{source}"]

            [[repos]]
            name = "custom-name"
            path = "{repo_path}"
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        assert len(cfg.repos) == 1
        assert cfg.repos[0].name == "custom-name"

    def test_name_dedup_on_collision(self, config_dir: Path):
        """When two source_dirs have same-named subdirs, names get suffixes."""
        src1 = config_dir / "code1"
        src1.mkdir()
        src2 = config_dir / "code2"
        src2.mkdir()
        _make_git_repo(src1, "project")
        _make_git_repo(src2, "project")

        cfg_file = _write_config(
            config_dir,
            f"""\
            source_dirs = ["{src1}", "{src2}"]
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        names = [r.name for r in cfg.repos]
        assert len(names) == 2
        assert "project" in names
        assert "project-2" in names

    def test_skips_hidden_dirs(self, config_dir: Path):
        """Directories starting with . are not picked up."""
        source = config_dir / "code"
        source.mkdir()
        _make_git_repo(source, ".hidden-repo")
        _make_git_repo(source, "visible")

        cfg_file = _write_config(
            config_dir,
            f"""\
            source_dirs = ["{source}"]
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        names = {r.name for r in cfg.repos}
        assert "visible" in names
        assert ".hidden-repo" not in names

    def test_nonexistent_source_dir_warns(self, config_dir: Path, caplog):
        """Non-existent source_dirs are warned about but don't crash."""
        cfg_file = _write_config(
            config_dir,
            """\
            source_dirs = ["/nonexistent/path/12345"]

            [[repos]]
            name = "fallback"
            path = "."
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        assert len(cfg.repos) == 1  # only the manual one
        assert "does not exist" in caplog.text

    def test_multiple_source_dirs(self, config_dir: Path):
        """Multiple source_dirs are all scanned."""
        src1 = config_dir / "work"
        src1.mkdir()
        src2 = config_dir / "personal"
        src2.mkdir()
        _make_git_repo(src1, "proj-a")
        _make_git_repo(src2, "proj-b")

        cfg_file = _write_config(
            config_dir,
            f"""\
            source_dirs = ["{src1}", "{src2}"]
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        names = {r.name for r in cfg.repos}
        assert names == {"proj-a", "proj-b"}

    def test_manual_repos_come_first(self, config_dir: Path):
        """Manually configured repos appear before auto-discovered ones."""
        source = config_dir / "code"
        source.mkdir()
        _make_git_repo(source, "auto-repo")
        manual = _make_git_repo(config_dir, "manual-repo")

        cfg_file = _write_config(
            config_dir,
            f"""\
            source_dirs = ["{source}"]

            [[repos]]
            name = "manual-repo"
            path = "{manual}"
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        assert cfg.repos[0].name == "manual-repo"
        assert cfg.repos[1].name == "auto-repo"

    def test_discovered_repos_sorted_alphabetically(self, config_dir: Path):
        """Auto-discovered repos are added in alphabetical order."""
        source = config_dir / "code"
        source.mkdir()
        _make_git_repo(source, "zebra")
        _make_git_repo(source, "alpha")
        _make_git_repo(source, "middle")

        cfg_file = _write_config(
            config_dir,
            f"""\
            source_dirs = ["{source}"]
            """,
        )
        cfg = DaemonConfig.from_file(cfg_file)
        names = [r.name for r in cfg.repos]
        assert names == ["alpha", "middle", "zebra"]
