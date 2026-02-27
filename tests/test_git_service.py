"""Tests for GitService."""

import subprocess

import pytest

from vantage.services.git_service import GitService


@pytest.fixture
def git_repo(tmp_path):
    """Create a temporary git repository with some commits."""
    repo_path = tmp_path / "repo"
    repo_path.mkdir()

    # Initialize git repo
    subprocess.run(["git", "init"], cwd=repo_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=repo_path,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=repo_path,
        check=True,
        capture_output=True,
    )

    # Create initial file and commit
    (repo_path / "README.md").write_text("# Initial content\n")
    subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=repo_path,
        check=True,
        capture_output=True,
    )

    # Modify file and commit again
    (repo_path / "README.md").write_text("# Updated content\n\nMore text here.\n")
    subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Update README"],
        cwd=repo_path,
        check=True,
        capture_output=True,
    )

    return repo_path


def test_git_service_no_repo(tmp_path):
    """Test GitService when not in a git repository."""
    service = GitService(tmp_path)
    assert service.repo is None


def test_git_service_with_repo(git_repo):
    """Test GitService with a valid git repository."""
    service = GitService(git_repo)
    assert service.repo is not None


def test_get_history(git_repo):
    """Test getting git history for a file."""
    service = GitService(git_repo)
    history = service.get_history("README.md")

    assert len(history) == 2
    assert history[0].message == "Update README"
    assert history[1].message == "Initial commit"


def test_get_history_limit(git_repo):
    """Test getting git history with a limit."""
    service = GitService(git_repo)
    history = service.get_history("README.md", limit=1)

    assert len(history) == 1
    assert history[0].message == "Update README"


def test_get_history_no_repo(tmp_path):
    """Test getting git history when not in a repo."""
    service = GitService(tmp_path)
    history = service.get_history("README.md")

    assert history == []


def test_get_last_commit(git_repo):
    """Test getting the last commit for a file."""
    service = GitService(git_repo)
    commit = service.get_last_commit("README.md")

    assert commit is not None
    assert commit.message == "Update README"
    assert commit.author_name == "Test User"
    assert commit.author_email == "test@example.com"


def test_get_last_commit_no_commits(git_repo):
    """Test getting last commit for a file with no commits."""
    service = GitService(git_repo)
    # Query a file that doesn't exist
    commit = service.get_last_commit("nonexistent.md")

    assert commit is None


def test_get_file_diff(git_repo):
    """Test getting a diff for a file."""
    service = GitService(git_repo)

    # Get the latest commit hash
    history = service.get_history("README.md", limit=1)
    commit_sha = history[0].hexsha

    diff = service.get_file_diff("README.md", commit_sha)

    assert diff is not None
    assert diff.commit_hexsha == commit_sha
    assert diff.commit_message == "Update README"
    assert diff.commit_author == "Test User"
    assert diff.file_path == "README.md"
    assert len(diff.hunks) > 0


def test_get_file_diff_no_repo(tmp_path):
    """Test getting a diff when not in a repo."""
    service = GitService(tmp_path)
    diff = service.get_file_diff("README.md", "abc123")

    assert diff is None


def test_get_file_diff_invalid_commit(git_repo):
    """Test getting a diff with an invalid commit SHA."""
    service = GitService(git_repo)
    diff = service.get_file_diff("README.md", "invalid_sha")

    assert diff is None


def test_parse_diff_adds(git_repo):
    """Test that diff parsing correctly identifies additions."""
    service = GitService(git_repo)

    history = service.get_history("README.md", limit=1)
    commit_sha = history[0].hexsha

    diff = service.get_file_diff("README.md", commit_sha)

    assert diff is not None

    # Check for add lines
    has_add = False
    for hunk in diff.hunks:
        for line in hunk.lines:
            if line.type == "add":
                has_add = True
                break

    assert has_add, "Expected at least one added line in the diff"


def test_recently_changed_files_excludes_node_modules(git_repo):
    """Test that node_modules and other excluded directories are filtered from recent files."""
    service = GitService(git_repo)

    # Create some files in various directories
    (git_repo / "src").mkdir()
    (git_repo / "src" / "main.md").write_text("# Main")

    (git_repo / "node_modules").mkdir()
    (git_repo / "node_modules" / "pkg").mkdir()
    (git_repo / "node_modules" / "pkg" / "README.md").write_text("# Package")

    (git_repo / ".venv").mkdir()
    (git_repo / ".venv" / "lib.md").write_text("# Venv file")

    # Commit all files
    subprocess.run(["git", "add", "."], cwd=git_repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Add files in various dirs"],
        cwd=git_repo,
        check=True,
        capture_output=True,
    )

    recent = service.get_recently_changed_files(limit=30)
    paths = [f["path"] for f in recent]

    # Should include src/main.md
    assert "src/main.md" in paths

    # Should exclude node_modules and .venv
    assert not any("node_modules" in p for p in paths)
    assert not any(".venv" in p for p in paths)


def test_recently_changed_files_custom_exclude_dirs(git_repo):
    """Test that custom exclude_dirs configuration is respected."""
    # Only exclude 'vendor', not node_modules
    service = GitService(git_repo, exclude_dirs=frozenset({"vendor"}))

    # Create some files
    (git_repo / "node_modules").mkdir()
    (git_repo / "node_modules" / "pkg").mkdir()
    (git_repo / "node_modules" / "pkg" / "README.md").write_text("# Package")

    (git_repo / "vendor").mkdir()
    (git_repo / "vendor" / "lib.md").write_text("# Vendor lib")

    # Commit all files
    subprocess.run(["git", "add", "."], cwd=git_repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Add vendor and node_modules"],
        cwd=git_repo,
        check=True,
        capture_output=True,
    )

    recent = service.get_recently_changed_files(limit=30)
    paths = [f["path"] for f in recent]

    # node_modules should NOT be excluded (not in custom list)
    assert any("node_modules" in p for p in paths)

    # vendor SHOULD be excluded
    assert not any("vendor" in p for p in paths)


def test_recently_changed_includes_intent_to_add_files(git_repo):
    """Test that files staged with 'git add -N' (intent-to-add) appear in recently changed."""
    service = GitService(git_repo)

    # Create a new file and stage it with --intent-to-add
    (git_repo / "intent.md").write_text("# Intent to add\n")
    subprocess.run(
        ["git", "add", "-N", "intent.md"],
        cwd=git_repo,
        check=True,
        capture_output=True,
    )

    recent = service.get_recently_changed_files(limit=30)
    paths = [f["path"] for f in recent]

    assert "intent.md" in paths

    # It should be marked as untracked (since it has no commit history)
    intent_file = next(f for f in recent if f["path"] == "intent.md")
    assert intent_file["untracked"] is True


def test_intent_to_add_detected_by_find_method(git_repo):
    """Test that _find_intent_to_add_files correctly detects intent-to-add files."""
    service = GitService(git_repo)

    # Create and stage with -N
    (git_repo / "ita_file.md").write_text("# ITA file\n")
    subprocess.run(
        ["git", "add", "-N", "ita_file.md"],
        cwd=git_repo,
        check=True,
        capture_output=True,
    )

    ita_files = service._find_intent_to_add_files()
    resolved = str((git_repo / "ita_file.md").resolve())
    assert resolved in ita_files


def test_intent_to_add_not_confused_with_normal_add(git_repo):
    """Test that normally staged files are NOT returned by _find_intent_to_add_files."""
    service = GitService(git_repo)

    # Create and stage normally (full add, not -N)
    (git_repo / "normal_add.md").write_text("# Normal add\n")
    subprocess.run(
        ["git", "add", "normal_add.md"],
        cwd=git_repo,
        check=True,
        capture_output=True,
    )

    ita_files = service._find_intent_to_add_files()
    resolved = str((git_repo / "normal_add.md").resolve())
    assert resolved not in ita_files


def test_recently_changed_files_sorted_by_date(git_repo):
    """Test that recent files are strictly sorted by date descending,
    regardless of whether they are tracked or untracked."""
    import time

    service = GitService(git_repo)

    # Create a tracked file with an old commit
    (git_repo / "old_tracked.md").write_text("# Old tracked\n")
    subprocess.run(["git", "add", "."], cwd=git_repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Add old tracked"],
        cwd=git_repo,
        check=True,
        capture_output=True,
    )

    # Create an untracked file with an older mtime
    (git_repo / "old_untracked.md").write_text("# Old untracked\n")
    old_time = time.time() - 86400 * 30  # 30 days ago
    import os

    os.utime(git_repo / "old_untracked.md", (old_time, old_time))

    # Now modify a tracked file so it has a very recent mtime
    time.sleep(1)
    (git_repo / "README.md").write_text("# Freshly edited\n")
    subprocess.run(["git", "add", "."], cwd=git_repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Fresh edit"],
        cwd=git_repo,
        check=True,
        capture_output=True,
    )

    recent = service.get_recently_changed_files(limit=30)
    dates = [f["date"] for f in recent]

    # Dates must be strictly non-increasing (sorted descending)
    for i in range(len(dates) - 1):
        assert dates[i] >= dates[i + 1], (
            f"Files not sorted by date: index {i} ({dates[i]}) < index {i + 1} ({dates[i + 1]}). "
            f"Paths: {[f['path'] for f in recent]}"
        )

    # The old untracked file should NOT be first — tracked files with
    # more recent dates should precede it.
    paths = [f["path"] for f in recent]
    assert (
        paths[0] != "old_untracked.md"
    ), "Old untracked file incorrectly appeared first despite having an older date"


class TestUntrackedLifecycle:
    """Full lifecycle tests: no file → untracked → staged → committed.

    Ensures that the ``untracked`` flag transitions correctly at every stage.
    """

    @staticmethod
    def _clear_recent_cache():
        """Flush the module-level recent-files cache so the next call is fresh."""
        from vantage.services.git_service import _recent_files_cache

        _recent_files_cache.clear()

    @staticmethod
    def _find(results, path):
        """Find a result entry by path, or None."""
        return next((r for r in results if r["path"] == path), None)

    def test_new_file_is_untracked(self, git_repo):
        """A brand-new file that has never been added or committed is untracked."""
        service = GitService(git_repo)
        (git_repo / "new_file.md").write_text("# New\n")
        self._clear_recent_cache()
        results = service.get_recently_changed_files(limit=30)
        entry = self._find(results, "new_file.md")
        assert entry is not None, "new_file.md not found in results"
        assert entry["untracked"] is True

    def test_staged_file_still_untracked_or_ita(self, git_repo):
        """After 'git add' (but no commit), the file is either ITA or untracked."""
        service = GitService(git_repo)
        (git_repo / "staged.md").write_text("# Staged\n")
        subprocess.run(
            ["git", "add", "staged.md"], cwd=git_repo, check=True, capture_output=True
        )
        self._clear_recent_cache()
        results = service.get_recently_changed_files(limit=30)
        entry = self._find(results, "staged.md")
        assert entry is not None, "staged.md not found in results"
        # Before commit, file has no log history so it should be untracked/ITA
        assert entry["untracked"] is True

    def test_committed_file_is_tracked(self, git_repo):
        """After commit, the file must have untracked=False."""
        service = GitService(git_repo)
        (git_repo / "committed.md").write_text("# Committed\n")
        subprocess.run(
            ["git", "add", "committed.md"],
            cwd=git_repo,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "Add committed.md"],
            cwd=git_repo,
            check=True,
            capture_output=True,
        )
        self._clear_recent_cache()
        results = service.get_recently_changed_files(limit=30)
        entry = self._find(results, "committed.md")
        assert entry is not None, "committed.md not found in results"
        assert entry["untracked"] is False, (
            f"committed.md still marked untracked after commit: {entry}"
        )
        assert entry["message"] == "Add committed.md"
        assert entry["author_name"] == "Test User"

    def test_full_lifecycle_untracked_to_committed(self, git_repo):
        """Full lifecycle: create → untracked, add → untracked, commit → tracked."""
        service = GitService(git_repo)

        # Phase 1: create file (untracked)
        (git_repo / "lifecycle.md").write_text("# Phase 1\n")
        self._clear_recent_cache()
        r1 = service.get_recently_changed_files(limit=30)
        e1 = self._find(r1, "lifecycle.md")
        assert e1 is not None, "Phase 1: lifecycle.md not in results"
        assert e1["untracked"] is True, f"Phase 1: expected untracked=True, got {e1}"

        # Phase 2: git add (still no commit history → untracked)
        subprocess.run(
            ["git", "add", "lifecycle.md"],
            cwd=git_repo,
            check=True,
            capture_output=True,
        )
        self._clear_recent_cache()
        r2 = service.get_recently_changed_files(limit=30)
        e2 = self._find(r2, "lifecycle.md")
        assert e2 is not None, "Phase 2: lifecycle.md not in results"
        assert e2["untracked"] is True, f"Phase 2: expected untracked=True, got {e2}"

        # Phase 3: git commit → must transition to tracked
        subprocess.run(
            ["git", "commit", "-m", "commit lifecycle.md"],
            cwd=git_repo,
            check=True,
            capture_output=True,
        )
        self._clear_recent_cache()
        r3 = service.get_recently_changed_files(limit=30)
        e3 = self._find(r3, "lifecycle.md")
        assert e3 is not None, "Phase 3: lifecycle.md not in results"
        assert e3["untracked"] is False, (
            f"Phase 3: lifecycle.md still untracked after commit: {e3}"
        )
        assert e3["message"] == "commit lifecycle.md"

    def test_nested_file_lifecycle(self, git_repo):
        """Same lifecycle but for a file in a subdirectory."""
        service = GitService(git_repo)
        subdir = git_repo / "notes"
        subdir.mkdir()

        # Phase 1: untracked
        (subdir / "deep.md").write_text("# Deep\n")
        self._clear_recent_cache()
        r1 = service.get_recently_changed_files(limit=30)
        e1 = self._find(r1, "notes/deep.md")
        assert e1 is not None, "Phase 1: notes/deep.md not in results"
        assert e1["untracked"] is True

        # Phase 2: commit → tracked
        subprocess.run(
            ["git", "add", "notes/deep.md"],
            cwd=git_repo,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "add deep note"],
            cwd=git_repo,
            check=True,
            capture_output=True,
        )
        self._clear_recent_cache()
        r2 = service.get_recently_changed_files(limit=30)
        e2 = self._find(r2, "notes/deep.md")
        assert e2 is not None, "Phase 2: notes/deep.md not in results"
        assert e2["untracked"] is False, (
            f"Phase 2: notes/deep.md still untracked after commit: {e2}"
        )

    def test_multiple_files_committed_together(self, git_repo):
        """Multiple untracked files committed in one go all transition."""
        service = GitService(git_repo)
        (git_repo / "a.md").write_text("# A\n")
        (git_repo / "b.md").write_text("# B\n")
        subdir = git_repo / "sub"
        subdir.mkdir()
        (subdir / "c.md").write_text("# C\n")

        # All start untracked
        self._clear_recent_cache()
        r1 = service.get_recently_changed_files(limit=30)
        for name in ["a.md", "b.md", "sub/c.md"]:
            e = self._find(r1, name)
            assert e is not None, f"{name} not found before commit"
            assert e["untracked"] is True, f"{name} should be untracked before commit"

        # Commit all at once
        subprocess.run(
            ["git", "add", "-A"], cwd=git_repo, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "commit", "-m", "batch commit"],
            cwd=git_repo,
            check=True,
            capture_output=True,
        )
        self._clear_recent_cache()
        r2 = service.get_recently_changed_files(limit=30)
        for name in ["a.md", "b.md", "sub/c.md"]:
            e = self._find(r2, name)
            assert e is not None, f"{name} not found after commit"
            assert e["untracked"] is False, (
                f"{name} still untracked after commit: {e}"
            )

    def test_cache_does_not_serve_stale_untracked_status(self, git_repo):
        """After commit + cache clear, untracked flag must update."""
        service = GitService(git_repo)
        (git_repo / "cached.md").write_text("# Cached\n")

        # Prime the cache with untracked result
        results1 = service.get_recently_changed_files(limit=30)
        e1 = self._find(results1, "cached.md")
        assert e1 is not None
        assert e1["untracked"] is True

        # Commit the file
        subprocess.run(
            ["git", "add", "cached.md"], cwd=git_repo, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "commit", "-m", "commit cached.md"],
            cwd=git_repo,
            check=True,
            capture_output=True,
        )

        # Without clearing cache, within TTL, might still be stale
        # (this is expected behavior — TTL cache)

        # After clearing cache, must return fresh data
        self._clear_recent_cache()
        results2 = service.get_recently_changed_files(limit=30)
        e2 = self._find(results2, "cached.md")
        assert e2 is not None
        assert e2["untracked"] is False, (
            f"cached.md still untracked after cache clear + commit: {e2}"
        )


class TestWatcherFilter:
    """Tests for the custom watcher filter that allows git state files through."""

    def test_allows_md_files(self):
        from watchfiles import Change

        from vantage.services.watcher import _GitAwareFilter

        f = _GitAwareFilter()
        assert f(Change.modified, "/repo/docs/readme.md") is True
        assert f(Change.added, "/repo/notes.md") is True

    def test_blocks_git_objects(self):
        from watchfiles import Change

        from vantage.services.watcher import _GitAwareFilter

        f = _GitAwareFilter()
        assert f(Change.modified, "/repo/.git/objects/ab/cdef1234") is False
        assert f(Change.modified, "/repo/.git/refs/heads/main") is False
        assert f(Change.modified, "/repo/.git/logs/HEAD") is False

    def test_allows_git_state_files(self):
        from watchfiles import Change

        from vantage.services.watcher import _GitAwareFilter

        f = _GitAwareFilter()
        assert f(Change.modified, "/repo/.git/index") is True
        assert f(Change.modified, "/repo/.git/HEAD") is True
        assert f(Change.modified, "/repo/.git/MERGE_HEAD") is True
        assert f(Change.modified, "/repo/.git/REBASE_HEAD") is True
        assert f(Change.modified, "/repo/.git/CHERRY_PICK_HEAD") is True

    def test_blocks_nested_git_state_files(self):
        """State file names in subdirectories of .git should be blocked."""
        from watchfiles import Change

        from vantage.services.watcher import _GitAwareFilter

        f = _GitAwareFilter()
        assert f(Change.modified, "/repo/.git/refs/HEAD") is False
        assert f(Change.modified, "/repo/.git/subdir/index") is False

    def test_still_filters_common_dirs(self):
        """node_modules, __pycache__, etc. should still be filtered."""
        from watchfiles import Change

        from vantage.services.watcher import _GitAwareFilter

        f = _GitAwareFilter()
        assert f(Change.modified, "/repo/node_modules/foo/bar.md") is False
        assert f(Change.modified, "/repo/__pycache__/foo.pyc") is False


def _init_git_repo(path):
    """Helper: git init + configure user + initial commit at path."""
    subprocess.run(["git", "init"], cwd=path, check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=path, check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=path, check=True, capture_output=True,
    )


class TestMultiGitRepos:
    """Tests for a parent directory containing multiple child git repos."""

    @staticmethod
    def _clear_cache():
        from vantage.services.git_service import _recent_files_cache
        _recent_files_cache.clear()

    @staticmethod
    def _find(results, path):
        return next((r for r in results if r["path"] == path), None)

    @pytest.fixture
    def parent_with_child_repos(self, tmp_path):
        """Create ~/projects-like structure with 2 child git repos."""
        parent = tmp_path / "projects"
        parent.mkdir()

        # Child repo A: project_a with committed files
        repo_a = parent / "project_a"
        repo_a.mkdir()
        _init_git_repo(repo_a)
        (repo_a / "README.md").write_text("# Project A\n")
        (repo_a / "notes.md").write_text("# Notes\n")
        subprocess.run(["git", "add", "."], cwd=repo_a, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Initial A"],
            cwd=repo_a, check=True, capture_output=True,
        )

        # Child repo B: project_b with committed + untracked files
        repo_b = parent / "project_b"
        repo_b.mkdir()
        _init_git_repo(repo_b)
        (repo_b / "guide.md").write_text("# Guide\n")
        subprocess.run(["git", "add", "."], cwd=repo_b, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Initial B"],
            cwd=repo_b, check=True, capture_output=True,
        )
        (repo_b / "draft.md").write_text("# Draft\n")  # untracked

        # Top-level file (no git repo)
        (parent / "TODO.md").write_text("# TODO\n")

        # Non-git subdirectory with a .md file
        misc = parent / "misc"
        misc.mkdir()
        (misc / "scratch.md").write_text("# Scratch\n")

        return parent

    def test_discovers_child_repos(self, parent_with_child_repos):
        """GitService on parent dir discovers child git repos."""
        service = GitService(parent_with_child_repos)
        assert service.repo is None  # parent is NOT a git repo
        children = service._discover_child_git_repos()
        names = {c.name for c in children}
        assert "project_a" in names
        assert "project_b" in names
        assert "misc" not in names  # no .git

    def test_committed_files_show_tracked(self, parent_with_child_repos):
        """Committed files in child repos show as tracked (not untracked)."""
        self._clear_cache()
        service = GitService(parent_with_child_repos)
        results = service.get_recently_changed_files(limit=30)

        # project_a/README.md should be tracked
        entry = self._find(results, "project_a/README.md")
        assert entry is not None, "project_a/README.md not found"
        assert entry["untracked"] is False
        assert entry["message"] == "Initial A"
        assert entry["author_name"] == "Test User"

        # project_b/guide.md should be tracked
        entry = self._find(results, "project_b/guide.md")
        assert entry is not None, "project_b/guide.md not found"
        assert entry["untracked"] is False

    def test_untracked_files_in_child_repo(self, parent_with_child_repos):
        """Untracked files in child repos show as untracked."""
        self._clear_cache()
        service = GitService(parent_with_child_repos)
        results = service.get_recently_changed_files(limit=30)

        entry = self._find(results, "project_b/draft.md")
        assert entry is not None, "project_b/draft.md not found"
        assert entry["untracked"] is True

    def test_top_level_files_are_untracked(self, parent_with_child_repos):
        """Files at the parent level (no git) are untracked."""
        self._clear_cache()
        service = GitService(parent_with_child_repos)
        results = service.get_recently_changed_files(limit=30)

        entry = self._find(results, "TODO.md")
        assert entry is not None, "TODO.md not found"
        assert entry["untracked"] is True

    def test_non_git_subdir_files_are_untracked(self, parent_with_child_repos):
        """Files in non-git subdirectories show as untracked."""
        self._clear_cache()
        service = GitService(parent_with_child_repos)
        results = service.get_recently_changed_files(limit=30)

        entry = self._find(results, "misc/scratch.md")
        assert entry is not None, "misc/scratch.md not found"
        assert entry["untracked"] is True

    def test_all_files_present(self, parent_with_child_repos):
        """All .md files across child repos and loose dirs appear in results."""
        self._clear_cache()
        service = GitService(parent_with_child_repos)
        results = service.get_recently_changed_files(limit=30)
        paths = {r["path"] for r in results}

        expected = {
            "project_a/README.md",
            "project_a/notes.md",
            "project_b/guide.md",
            "project_b/draft.md",
            "TODO.md",
            "misc/scratch.md",
        }
        assert expected.issubset(paths), f"Missing: {expected - paths}"

    def test_results_sorted_by_date(self, parent_with_child_repos):
        """Results from all sources are sorted by date descending."""
        self._clear_cache()
        service = GitService(parent_with_child_repos)
        results = service.get_recently_changed_files(limit=30)
        dates = [r["date"] for r in results]
        for i in range(len(dates) - 1):
            assert dates[i] >= dates[i + 1], (
                f"Not sorted at index {i}: {dates[i]} < {dates[i + 1]}"
            )

    def test_no_child_repos_falls_back_to_untracked(self, tmp_path):
        """Parent with no child git repos shows all files as untracked."""
        parent = tmp_path / "empty_parent"
        parent.mkdir()
        (parent / "readme.md").write_text("# Hi\n")
        subdir = parent / "docs"
        subdir.mkdir()
        (subdir / "notes.md").write_text("# Notes\n")

        self._clear_cache()
        service = GitService(parent)
        results = service.get_recently_changed_files(limit=30)

        assert len(results) == 2
        for r in results:
            assert r["untracked"] is True

    def test_get_history_delegates_to_child_repo(self, parent_with_child_repos):
        """get_history returns commit history for files in child git repos."""
        service = GitService(parent_with_child_repos)
        assert service.repo is None  # parent is NOT a git repo

        history = service.get_history("project_a/README.md", limit=10)
        assert len(history) >= 1
        assert history[0].message == "Initial A"
        assert history[0].author_name == "Test User"
        assert history[0].hexsha  # has a real SHA

    def test_get_history_returns_empty_for_top_level_file(self, parent_with_child_repos):
        """get_history returns empty for files not in any child git repo."""
        service = GitService(parent_with_child_repos)
        history = service.get_history("TODO.md", limit=10)
        assert history == []

    def test_get_last_commit_delegates_to_child_repo(self, parent_with_child_repos):
        """get_last_commit returns the latest commit for a child repo file."""
        service = GitService(parent_with_child_repos)
        commit = service.get_last_commit("project_b/guide.md")
        assert commit is not None
        assert commit.message == "Initial B"

    def test_get_last_commit_returns_none_for_untracked(self, parent_with_child_repos):
        """get_last_commit returns None for untracked files in child repos."""
        service = GitService(parent_with_child_repos)
        commit = service.get_last_commit("project_b/draft.md")
        assert commit is None

    def test_get_file_diff_delegates_to_child_repo(self, parent_with_child_repos):
        """get_file_diff works for files in child git repos."""
        # Add a second commit so we can diff against the parent
        repo_a = parent_with_child_repos / "project_a"
        (repo_a / "README.md").write_text("# Project A\nUpdated content\n")
        subprocess.run(["git", "add", "."], cwd=repo_a, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Update README"],
            cwd=repo_a, check=True, capture_output=True,
        )

        service = GitService(parent_with_child_repos)
        commit = service.get_last_commit("project_a/README.md")
        assert commit is not None
        assert commit.message == "Update README"

        diff = service.get_file_diff("project_a/README.md", commit.hexsha)
        assert diff is not None
        assert diff.commit_hexsha == commit.hexsha

    def test_get_last_commits_batch_delegates_to_child_repos(
        self, parent_with_child_repos
    ):
        """get_last_commits_batch returns commits for files across child repos."""
        service = GitService(parent_with_child_repos)
        paths = [
            "project_a/README.md",
            "project_b/guide.md",
            "TODO.md",  # top-level, no git
        ]
        result = service.get_last_commits_batch(paths)
        assert "project_a/README.md" in result
        assert result["project_a/README.md"].message == "Initial A"
        assert "project_b/guide.md" in result
        assert result["project_b/guide.md"].message == "Initial B"
        assert "TODO.md" not in result  # no commit for top-level file
