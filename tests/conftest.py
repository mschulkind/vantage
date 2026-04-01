"""Shared test fixtures."""

import os

import pytest


@pytest.fixture(autouse=True)
def _clean_git_env_vars():
    """Strip GIT_AUTHOR_*/GIT_COMMITTER_* env vars that git sets during commits.

    When tests run inside a pre-commit hook, git injects GIT_AUTHOR_NAME,
    GIT_COMMITTER_NAME, etc. into the environment. These override repo-level
    git config in temp repos created by tests, causing author-name assertions
    to fail. This fixture removes them for every test.
    """
    saved = {}
    for key in list(os.environ):
        if key.startswith("GIT_AUTHOR_") or key.startswith("GIT_COMMITTER_"):
            saved[key] = os.environ.pop(key)
    yield
    os.environ.update(saved)
