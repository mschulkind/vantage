"""Performance benchmark tests.

These tests create synthetic repos of varying sizes and measure the
latency of key operations.  They are NOT meant for CI gating — they
run with `pytest -m perf` and are skipped by default.

Run:
    pytest tests/test_perf.py -v -s
"""

import os
import random
import string
import subprocess
import time
from pathlib import Path

import pytest

from vantage.services.fs_service import FileSystemService
from vantage.services.git_service import GitService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

EXTENSIONS = [".md", ".py", ".ts", ".tsx", ".json", ".yaml", ".txt", ".css"]


def _random_name(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase, k=length))


def _make_file(path: Path, size_bytes: int = 200) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x" * size_bytes)


def _create_synthetic_repo(
    root: Path,
    total_files: int,
    max_depth: int = 4,
    dirs_per_level: int = 5,
    init_git: bool = True,
) -> Path:
    """Create a synthetic repository with a realistic file structure."""
    root.mkdir(parents=True, exist_ok=True)

    # Build directory skeleton
    dirs: list[Path] = [root]
    for _depth in range(1, max_depth + 1):
        new_dirs = []
        for parent in dirs:
            for _ in range(random.randint(1, dirs_per_level)):
                d = parent / _random_name(6)
                d.mkdir(parents=True, exist_ok=True)
                new_dirs.append(d)
        dirs.extend(new_dirs)

    # Distribute files across directories
    for _i in range(total_files):
        target_dir = random.choice(dirs)
        ext = random.choice(EXTENSIONS)
        _make_file(target_dir / f"{_random_name()}{ext}")

    if init_git:
        subprocess.run(["git", "init"], cwd=root, capture_output=True, check=True)
        subprocess.run(["git", "add", "."], cwd=root, capture_output=True, check=True)
        subprocess.run(
            ["git", "commit", "-m", "initial", "--no-gpg-sign"],
            cwd=root,
            capture_output=True,
            check=True,
            env={
                **os.environ,
                "GIT_AUTHOR_NAME": "test",
                "GIT_AUTHOR_EMAIL": "t@t",
                "GIT_COMMITTER_NAME": "test",
                "GIT_COMMITTER_EMAIL": "t@t",
            },
        )

    return root


def _measure(fn, label: str, iterations: int = 3) -> dict:
    """Measure a callable and return timing statistics."""
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        fn()
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
    times.sort()
    stats = {
        "label": label,
        "min_ms": round(times[0], 1),
        "median_ms": round(times[len(times) // 2], 1),
        "max_ms": round(times[-1], 1),
    }
    print(
        f"  {label}: min={stats['min_ms']}ms median={stats['median_ms']}ms max={stats['max_ms']}ms"
    )
    return stats


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def small_repo(tmp_path):
    """100 files, shallow."""
    return _create_synthetic_repo(tmp_path / "small", total_files=100, max_depth=3)


@pytest.fixture
def medium_repo(tmp_path):
    """1000 files, moderate depth."""
    return _create_synthetic_repo(tmp_path / "medium", total_files=1000, max_depth=5)


@pytest.fixture
def large_repo(tmp_path):
    """5000 files, deep hierarchy."""
    return _create_synthetic_repo(
        tmp_path / "large", total_files=5000, max_depth=6, dirs_per_level=6
    )


# ---------------------------------------------------------------------------
# Benchmarks — FileSystemService
# ---------------------------------------------------------------------------


class TestFSPerformance:
    """Benchmark FileSystemService operations."""

    def test_list_directory_root(self, small_repo):
        fs = FileSystemService(small_repo)
        stats = _measure(lambda: fs.list_directory("."), "list_directory(root)")
        assert stats["median_ms"] < 5000  # sanity bound, not a hard SLA

    def test_list_directory_root_medium(self, medium_repo):
        fs = FileSystemService(medium_repo)
        stats = _measure(lambda: fs.list_directory("."), "list_directory(root) 1K files")
        assert stats["median_ms"] < 10000

    def test_list_directory_root_large(self, large_repo):
        fs = FileSystemService(large_repo)
        stats = _measure(lambda: fs.list_directory("."), "list_directory(root) 5K files")
        assert stats["median_ms"] < 30000

    def test_list_all_files(self, medium_repo):
        fs = FileSystemService(medium_repo)
        stats = _measure(lambda: fs.list_all_files(), "list_all_files 1K files")
        assert stats["median_ms"] < 5000

    def test_list_all_files_large(self, large_repo):
        fs = FileSystemService(large_repo)
        stats = _measure(lambda: fs.list_all_files(), "list_all_files 5K files")
        assert stats["median_ms"] < 10000

    def test_list_directory_with_git(self, small_repo):
        fs = FileSystemService(small_repo)
        stats = _measure(
            lambda: fs.list_directory(".", include_git=True),
            "list_directory(root, git=True)",
        )
        assert stats["median_ms"] < 10000

    def test_list_directory_with_git_medium(self, medium_repo):
        fs = FileSystemService(medium_repo)
        stats = _measure(
            lambda: fs.list_directory(".", include_git=True),
            "list_directory(root, git=True) 1K files",
        )
        assert stats["median_ms"] < 20000


# ---------------------------------------------------------------------------
# Benchmarks — GitService
# ---------------------------------------------------------------------------


class TestGitPerformance:
    """Benchmark GitService operations."""

    def test_working_dir_status(self, medium_repo):
        git = GitService(medium_repo)
        stats = _measure(lambda: git.get_working_dir_status(), "git_status 1K files")
        assert stats["median_ms"] < 5000

    def test_working_dir_status_large(self, large_repo):
        git = GitService(large_repo)
        stats = _measure(lambda: git.get_working_dir_status(), "git_status 5K files")
        assert stats["median_ms"] < 10000

    def test_recent_files(self, medium_repo):
        git = GitService(medium_repo)
        # Bust the TTL cache to get real measurements
        stats = _measure(
            lambda: git.get_recently_changed_files(limit=30),
            "recent_files 1K files",
        )
        assert stats["median_ms"] < 10000

    def test_recent_files_large(self, large_repo):
        git = GitService(large_repo)
        stats = _measure(
            lambda: git.get_recently_changed_files(limit=30),
            "recent_files 5K files",
        )
        assert stats["median_ms"] < 20000

    def test_get_history(self, medium_repo):
        """Test git log on a single file."""
        git = GitService(medium_repo)
        # Find a real file to test with
        any_file = next((p.relative_to(medium_repo) for p in medium_repo.rglob("*.md")), None)
        if any_file is None:
            pytest.skip("no md files in repo")
        stats = _measure(
            lambda: git.get_history(str(any_file), limit=10),
            "git_log(single_file)",
        )
        assert stats["median_ms"] < 5000

    def test_batch_commits(self, medium_repo):
        """Test batch commit lookup for N paths."""
        git = GitService(medium_repo)
        paths = [str(p.relative_to(medium_repo)) for p in list(medium_repo.rglob("*.md"))[:20]]
        if not paths:
            pytest.skip("no md files")
        stats = _measure(
            lambda: git.get_last_commits_batch(paths),
            f"batch_commits({len(paths)} paths)",
        )
        assert stats["median_ms"] < 10000


# ---------------------------------------------------------------------------
# Benchmarks — Perf infrastructure itself
# ---------------------------------------------------------------------------


class TestPerfInfrastructure:
    """Ensure perf instrumentation overhead is negligible."""

    def test_ring_buffer_throughput(self):
        from vantage.services.perf import PerfStore, TimingRecord

        store = PerfStore(maxlen=5000)
        start = time.perf_counter()
        for i in range(10000):
            store.record(
                TimingRecord(
                    category="test", operation=f"op_{i % 50}", duration_ms=random.uniform(1, 500)
                )
            )
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f"  10K records: {elapsed_ms:.1f}ms")
        assert elapsed_ms < 500  # should be very fast

    def test_aggregation_speed(self):
        from vantage.services.perf import PerfStore, TimingRecord

        store = PerfStore(maxlen=5000)
        for i in range(2000):
            store.record(
                TimingRecord(
                    category="request" if i % 2 == 0 else "git",
                    operation=f"op_{i % 20}",
                    duration_ms=random.uniform(1, 500),
                )
            )
        start = time.perf_counter()
        store.by_operation()
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f"  by_operation() on 2K records: {elapsed_ms:.1f}ms")
        assert elapsed_ms < 200

    def test_collect_repo_shape(self, medium_repo):
        from vantage.services.perf import collect_repo_shape

        stats = _measure(
            lambda: collect_repo_shape(str(medium_repo)),
            "collect_repo_shape 1K files",
        )
        assert stats["median_ms"] < 5000

        shape = collect_repo_shape(str(medium_repo))
        assert shape["total_files"] >= 900  # ~1000 with some slack
        assert shape["total_dirs"] > 10
        assert ".md" in shape["extension_distribution"]
