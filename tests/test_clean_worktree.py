"""Tests that build/setup commands never dirty the git working tree.

The deploy workflow is `git pull && just deploy`. If setup or build
modifies tracked files (lockfiles, pyproject.toml, etc.), the next
`git pull` may fail with merge conflicts or leave the working dir
in an unexpected state.
"""

import shutil
import subprocess

import pytest


def _git_dirty_files() -> list[str]:
    """Return list of tracked files with uncommitted changes."""
    result = subprocess.run(
        ["git", "diff", "--name-only"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [f for f in result.stdout.strip().splitlines() if f]


@pytest.mark.skipif(shutil.which("just") is None, reason="just not installed")
def test_setup_does_not_dirty_worktree():
    """Running `just setup` must not modify any tracked files."""
    # Record initial state
    before = _git_dirty_files()

    result = subprocess.run(
        ["just", "setup"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, f"just setup failed:\n{result.stderr}"

    after = _git_dirty_files()
    new_dirty = set(after) - set(before)
    assert not new_dirty, (
        f"just setup modified tracked files: {new_dirty}\n"
        "Setup must use --frozen / ci flags to avoid updating lockfiles."
    )


def test_lockfiles_in_sync():
    """Lockfiles must be consistent with their manifests.

    If someone updates pyproject.toml or package.json without regenerating
    the lockfile, --frozen installs will fail on other machines.
    """
    # uv sync --frozen will fail if uv.lock is out of date
    result = subprocess.run(
        ["uv", "sync", "--frozen", "--dry-run"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, (
        f"uv.lock is out of sync with pyproject.toml:\n{result.stderr}\n"
        "Run `uv lock` and commit the updated uv.lock."
    )

    # npm ci will fail if package-lock.json is out of date
    result = subprocess.run(
        ["npm", "ci", "--dry-run"],
        capture_output=True,
        text=True,
        timeout=30,
        cwd="frontend",
    )
    assert result.returncode == 0, (
        f"package-lock.json is out of sync with package.json:\n{result.stderr}\n"
        "Run `npm install` and commit the updated package-lock.json."
    )
