"""Security tests for path traversal, repo isolation, and input validation."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from vantage.main import app
from vantage.services.fs_service import FileSystemService

client = TestClient(app)


# ---------------------------------------------------------------------------
# Path traversal tests (FileSystemService.validate_path)
# ---------------------------------------------------------------------------


class TestPathTraversal:
    """Ensure validate_path rejects all forms of path traversal."""

    def setup_method(self):
        self.fs = FileSystemService(Path("/tmp/vantage-test-root"))

    def test_rejects_absolute_path(self):
        with pytest.raises(ValueError, match="Absolute paths not allowed"):
            self.fs.validate_path("/etc/passwd")

    def test_rejects_null_byte(self):
        with pytest.raises(ValueError, match="Invalid path"):
            self.fs.validate_path("file.md\x00.txt")

    def test_rejects_double_dot(self):
        with pytest.raises(ValueError, match="Path traversal detected"):
            self.fs.validate_path("../../../etc/passwd")

    def test_rejects_double_dot_in_middle(self):
        with pytest.raises(ValueError, match="Path traversal detected"):
            self.fs.validate_path("subdir/../../etc/passwd")

    def test_rejects_empty_path(self):
        with pytest.raises(ValueError, match="Invalid path"):
            self.fs.validate_path("")

    def test_encoded_traversal_stays_in_bounds(self):
        """Percent-encoded dots are literal filenames on the filesystem, not traversal.

        Path('..%2F..%2Fetc/passwd') resolves to root/..%2F..%2Fetc/passwd,
        which stays inside root.  This is safe — verify it doesn't escape.
        """
        # Stays in bounds (literal filename), so validate_path should NOT raise
        # for traversal.  It may raise for file-not-found at a higher layer.
        result = self.fs.validate_path("..%2F..%2Fetc/passwd")
        # The resolved path must still be under root_path
        assert str(result).startswith(str(self.fs.root_path))

    def test_backslash_stays_in_bounds(self):
        """On Linux, backslash is a valid filename character, not a separator.

        Path('..\\..\\etc\\passwd') resolves to root/..\\..\\etc\\passwd
        which stays inside root.  This is safe.
        """
        result = self.fs.validate_path("..\\..\\etc\\passwd")
        assert str(result).startswith(str(self.fs.root_path))

    def test_accepts_valid_subpath(self, tmp_path):
        fs = FileSystemService(tmp_path)
        (tmp_path / "docs").mkdir()
        (tmp_path / "docs" / "file.md").write_text("ok")
        result = fs.validate_path("docs/file.md")
        assert result == tmp_path / "docs" / "file.md"

    def test_rejects_symlink_escape(self, tmp_path):
        """Symlinks that point outside root_path must be rejected."""
        fs = FileSystemService(tmp_path)
        link = tmp_path / "escape"
        link.symlink_to("/etc")
        with pytest.raises(ValueError, match="Path traversal detected"):
            fs.validate_path("escape/passwd")

    def test_rejects_git_dir_access(self):
        with pytest.raises(ValueError, match="Access to .git directory"):
            self.fs.validate_path(".git/config")

    def test_rejects_nested_git_dir_access(self):
        with pytest.raises(ValueError, match="Access to .git directory"):
            self.fs.validate_path("subdir/.git/HEAD")

    def test_allows_dotgit_in_filename(self, tmp_path):
        """Files named .gitignore or similar should be allowed."""
        fs = FileSystemService(tmp_path)
        (tmp_path / ".gitignore").write_text("node_modules")
        result = fs.validate_path(".gitignore")
        assert result == tmp_path / ".gitignore"


class TestListDirectoryFiltering:
    """Ensure list_directory respects exclude_dirs and show_hidden."""

    def test_excludes_git_dir(self, tmp_path):
        (tmp_path / ".git").mkdir()
        (tmp_path / ".git" / "HEAD").write_text("ref: refs/heads/main")
        (tmp_path / "README.md").write_text("hello")
        fs = FileSystemService(tmp_path)
        tree = fs.list_directory()
        names = [node.name for node in tree]
        assert ".git" not in names
        assert "README.md" in names

    def test_shows_hidden_dirs_by_default(self, tmp_path):
        (tmp_path / ".hidden").mkdir()
        (tmp_path / ".hidden" / "file.md").write_text("secret")
        fs = FileSystemService(tmp_path)
        tree = fs.list_directory()
        names = [node.name for node in tree]
        assert ".hidden" in names

    def test_hides_hidden_dirs_when_configured(self, tmp_path):
        (tmp_path / ".hidden").mkdir()
        (tmp_path / ".hidden" / "file.md").write_text("secret")
        fs = FileSystemService(tmp_path, show_hidden=False)
        tree = fs.list_directory()
        names = [node.name for node in tree]
        assert ".hidden" not in names


# ---------------------------------------------------------------------------
# API path traversal tests
# ---------------------------------------------------------------------------


class TestApiPathTraversal:
    """Ensure API endpoints reject path traversal."""

    def test_tree_path_traversal(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        response = client.get("/api/tree?path=../../etc")
        assert response.status_code == 400

    def test_content_path_traversal(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        response = client.get("/api/content?path=../../etc/passwd")
        assert response.status_code == 400

    def test_content_absolute_path(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        response = client.get("/api/content?path=/etc/passwd")
        assert response.status_code == 400

    def test_content_null_byte(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        response = client.get("/api/content?path=test.md%00.txt")
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Legacy endpoint blocking in daemon (multi-repo) mode
# ---------------------------------------------------------------------------


class TestDaemonModeBlocking:
    """Legacy endpoints must return 404 when server is in multi-repo mode."""

    @pytest.fixture(autouse=True)
    def _setup_daemon_mode(self, tmp_path, monkeypatch):
        """Enable multi-repo mode for these tests."""
        from vantage import settings as settings_mod
        from vantage.config import DaemonConfig, RepoConfig

        config = DaemonConfig(
            repos=[
                RepoConfig(name="testrepo", path=tmp_path),
            ]
        )

        # Set daemon config
        monkeypatch.setattr(settings_mod, "daemon_config", config)
        monkeypatch.setattr(settings_mod.settings, "multi_repo", True)

        # Create test content
        (tmp_path / "hello.md").write_text("# Hello")
        self.tmp_path = tmp_path

        yield

        # Clean up
        monkeypatch.setattr(settings_mod, "daemon_config", None)
        monkeypatch.setattr(settings_mod.settings, "multi_repo", False)

    def test_legacy_tree_blocked(self):
        response = client.get("/api/tree")
        assert response.status_code == 404

    def test_legacy_content_blocked(self):
        response = client.get("/api/content?path=hello.md")
        assert response.status_code == 404

    def test_legacy_git_history_blocked(self):
        response = client.get("/api/git/history?path=hello.md")
        assert response.status_code == 404

    def test_legacy_git_status_blocked(self):
        response = client.get("/api/git/status?path=hello.md")
        assert response.status_code == 404

    def test_legacy_git_diff_blocked(self):
        response = client.get("/api/git/diff?path=hello.md&commit=abc123")
        assert response.status_code in (400, 404)

    def test_legacy_git_recent_blocked(self):
        response = client.get("/api/git/recent")
        assert response.status_code == 404

    def test_legacy_info_blocked(self):
        response = client.get("/api/info")
        assert response.status_code == 404

    def test_legacy_files_blocked(self):
        response = client.get("/api/files")
        assert response.status_code == 404

    def test_multirepo_tree_works(self):
        response = client.get("/api/r/testrepo/tree")
        assert response.status_code == 200
        names = [n["name"] for n in response.json()]
        assert "hello.md" in names

    def test_multirepo_content_works(self):
        response = client.get("/api/r/testrepo/content?path=hello.md")
        assert response.status_code == 200
        assert response.json()["content"] == "# Hello"

    def test_multirepo_invalid_repo_rejected(self):
        response = client.get("/api/r/nonexistent/tree")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# RepoInfo does not leak filesystem paths
# ---------------------------------------------------------------------------


class TestRepoInfoNoPathLeak:
    """Ensure /api/repos does not expose absolute filesystem paths."""

    def test_single_repo_no_path(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        response = client.get("/api/repos")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert "path" not in data[0]
        assert data[0]["name"] == ""

    def test_multi_repo_no_path(self, tmp_path, monkeypatch):
        from vantage import settings as settings_mod
        from vantage.config import DaemonConfig, RepoConfig

        config = DaemonConfig(
            repos=[
                RepoConfig(name="notes", path=tmp_path),
            ]
        )
        monkeypatch.setattr(settings_mod, "daemon_config", config)
        monkeypatch.setattr(settings_mod.settings, "multi_repo", True)

        try:
            response = client.get("/api/repos")
            assert response.status_code == 200
            data = response.json()
            for repo in data:
                assert "path" not in repo, f"Absolute path leaked: {repo}"
                assert repo["name"] == "notes"
        finally:
            monkeypatch.setattr(settings_mod, "daemon_config", None)
            monkeypatch.setattr(settings_mod.settings, "multi_repo", False)


# ---------------------------------------------------------------------------
# Commit SHA validation
# ---------------------------------------------------------------------------


class TestCommitShaValidation:
    """Ensure commit SHA parameter is validated as a hex string."""

    def test_valid_sha_accepted(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)
        (tmp_path / "test.md").write_text("hello")

        # Valid SHA but file won't have this commit — should 404
        response = client.get("/api/git/diff?path=test.md&commit=abc123def0")
        assert response.status_code in (200, 404)

    def test_invalid_sha_rejected(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        # Shell injection attempt
        response = client.get("/api/git/diff?path=test.md&commit=abc;rm+-rf+/")
        assert response.status_code == 400

    def test_sha_with_spaces_rejected(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        response = client.get("/api/git/diff?path=test.md&commit=abc def")
        assert response.status_code == 400

    def test_sha_too_short_rejected(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        response = client.get("/api/git/diff?path=test.md&commit=ab")
        assert response.status_code == 400

    def test_sha_with_dot_dot_rejected(self, tmp_path, monkeypatch):
        """Reject git revision range syntax like HEAD..main."""
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)

        response = client.get("/api/git/diff?path=test.md&commit=HEAD..main")
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Repo isolation tests
# ---------------------------------------------------------------------------


class TestRepoIsolation:
    """Ensure multi-repo endpoints cannot access files outside their configured root."""

    @pytest.fixture(autouse=True)
    def _setup_repos(self, tmp_path, monkeypatch):
        from vantage import settings as settings_mod
        from vantage.config import DaemonConfig, RepoConfig

        # Create two isolated repos
        repo_a = tmp_path / "repo_a"
        repo_a.mkdir()
        (repo_a / "secret_a.md").write_text("Repo A secret")

        repo_b = tmp_path / "repo_b"
        repo_b.mkdir()
        (repo_b / "public_b.md").write_text("Repo B public")

        config = DaemonConfig(
            repos=[
                RepoConfig(name="alpha", path=repo_a),
                RepoConfig(name="beta", path=repo_b),
            ]
        )
        monkeypatch.setattr(settings_mod, "daemon_config", config)
        monkeypatch.setattr(settings_mod.settings, "multi_repo", True)
        self.repo_a = repo_a
        self.repo_b = repo_b

        yield

        monkeypatch.setattr(settings_mod, "daemon_config", None)
        monkeypatch.setattr(settings_mod.settings, "multi_repo", False)

    def test_cannot_traverse_to_other_repo(self):
        response = client.get("/api/r/alpha/content?path=../repo_b/public_b.md")
        assert response.status_code == 400

    def test_cannot_access_parent_directory(self):
        response = client.get("/api/r/alpha/content?path=../../../etc/passwd")
        assert response.status_code == 400

    def test_cannot_read_absolute_path_via_repo(self):
        response = client.get("/api/r/alpha/content?path=/etc/passwd")
        assert response.status_code == 400

    def test_can_read_own_files(self):
        response = client.get("/api/r/alpha/content?path=secret_a.md")
        assert response.status_code == 200
        assert response.json()["content"] == "Repo A secret"

    def test_repo_b_cannot_read_repo_a(self):
        response = client.get("/api/r/beta/content?path=../repo_a/secret_a.md")
        assert response.status_code == 400


class TestRepoAllowedReadRoots:
    """Ensure per-repo allowed_read_roots only permits configured symlink targets."""

    @pytest.fixture(autouse=True)
    def _setup_repo(self, tmp_path, monkeypatch):
        from vantage import settings as settings_mod
        from vantage.config import DaemonConfig, RepoConfig

        repo = tmp_path / "repo"
        repo.mkdir()
        allowed = tmp_path / "allowed"
        allowed.mkdir()
        blocked = tmp_path / "blocked"
        blocked.mkdir()

        (allowed / "ok.md").write_text("ok")
        (blocked / "no.md").write_text("no")
        (repo / "ok.md").symlink_to(allowed / "ok.md")
        (repo / "no.md").symlink_to(blocked / "no.md")

        config = DaemonConfig(
            repos=[
                RepoConfig(name="repo", path=repo, allowed_read_roots=[allowed]),
            ]
        )
        monkeypatch.setattr(settings_mod, "daemon_config", config)
        monkeypatch.setattr(settings_mod.settings, "multi_repo", True)
        yield
        monkeypatch.setattr(settings_mod, "daemon_config", None)
        monkeypatch.setattr(settings_mod.settings, "multi_repo", False)

    def test_allows_symlink_target_inside_allowed_root(self):
        response = client.get("/api/r/repo/content?path=ok.md")
        assert response.status_code == 200
        assert response.json()["content"] == "ok"

    def test_rejects_symlink_target_outside_allowed_root(self):
        response = client.get("/api/r/repo/content?path=no.md")
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------


class TestSecurityHeaders:
    """Verify security headers are set on all responses."""

    def test_security_headers_present(self):
        response = client.get("/api/info")
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"
        assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


# ---------------------------------------------------------------------------
# .git path blocking via API
# ---------------------------------------------------------------------------


class TestGitDirBlocking:
    """Ensure .git directory cannot be accessed via API."""

    def test_content_git_config(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)
        (tmp_path / ".git").mkdir()
        (tmp_path / ".git" / "config").write_text("[core]")

        response = client.get("/api/content?path=.git/config")
        assert response.status_code == 400

    def test_content_git_head(self, tmp_path, monkeypatch):
        from vantage.settings import settings

        monkeypatch.setattr(settings, "target_repo", tmp_path)
        (tmp_path / ".git").mkdir()
        (tmp_path / ".git" / "HEAD").write_text("ref: refs/heads/main")

        response = client.get("/api/content?path=.git/HEAD")
        assert response.status_code == 400
