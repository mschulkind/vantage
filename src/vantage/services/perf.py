"""Performance instrumentation for Vantage.

Provides request timing middleware and service-level timing helpers.
Data is stored in an in-memory ring buffer for diagnostics export.
"""

from __future__ import annotations

import functools
import logging
import os
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Ring buffer for timing records
# ---------------------------------------------------------------------------

_MAX_RECORDS = 2000


@dataclass
class TimingRecord:
    """A single timing measurement."""

    category: str  # "request", "git", "fs", "jj"
    operation: str  # e.g. "GET /api/tree", "git_log", "list_directory"
    duration_ms: float
    timestamp: float = field(default_factory=time.time)
    status: int | None = None  # HTTP status for requests
    meta: dict[str, Any] = field(default_factory=dict)


class PerfStore:
    """Thread-safe ring buffer of timing records + aggregate stats."""

    def __init__(self, maxlen: int = _MAX_RECORDS) -> None:
        self._records: deque[TimingRecord] = deque(maxlen=maxlen)
        self._request_count = 0
        self._service_call_count = 0

    def record(self, rec: TimingRecord) -> None:
        self._records.append(rec)
        if rec.category == "request":
            self._request_count += 1
        else:
            self._service_call_count += 1

    @property
    def records(self) -> list[TimingRecord]:
        return list(self._records)

    @property
    def request_count(self) -> int:
        return self._request_count

    @property
    def service_call_count(self) -> int:
        return self._service_call_count

    def clear(self) -> None:
        self._records.clear()
        self._request_count = 0
        self._service_call_count = 0

    # ---- Aggregation helpers ----

    def percentiles(
        self, category: str | None = None, operation: str | None = None
    ) -> dict[str, float]:
        """Compute p50/p95/p99/max for matching records."""
        durations = [
            r.duration_ms
            for r in self._records
            if (category is None or r.category == category)
            and (operation is None or r.operation == operation)
        ]
        if not durations:
            return {}
        durations.sort()
        n = len(durations)
        return {
            "count": n,
            "p50": durations[int(n * 0.50)],
            "p95": durations[min(int(n * 0.95), n - 1)],
            "p99": durations[min(int(n * 0.99), n - 1)],
            "max": durations[-1],
            "avg": sum(durations) / n,
        }

    def by_operation(self, category: str | None = None) -> dict[str, dict[str, float]]:
        """Group percentiles by operation name."""
        ops: set[str] = set()
        for r in self._records:
            if category is None or r.category == category:
                ops.add(r.operation)
        return {op: self.percentiles(category=category, operation=op) for op in sorted(ops)}

    def slow_requests(self, threshold_ms: float = 500, limit: int = 20) -> list[dict]:
        """Return the slowest requests above threshold."""
        slow = [
            {
                "operation": r.operation,
                "duration_ms": round(r.duration_ms, 1),
                "status": r.status,
                "meta": r.meta,
                "timestamp": r.timestamp,
            }
            for r in self._records
            if r.category == "request" and r.duration_ms >= threshold_ms
        ]
        slow.sort(key=lambda x: x["duration_ms"], reverse=True)
        return slow[:limit]


# Global store instance
perf_store = PerfStore()


# ---------------------------------------------------------------------------
# FastAPI middleware
# ---------------------------------------------------------------------------


class PerfMiddleware(BaseHTTPMiddleware):
    """Records request timing for all /api/ routes."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Only instrument API routes
        path = request.url.path
        if not path.startswith("/api/") or path.startswith("/api/perf"):
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        # Normalize path: strip repo name from /api/r/{repo}/... → /api/r/*/...
        display_path = path
        if path.startswith("/api/r/"):
            parts = path.split("/", 4)
            if len(parts) >= 4:
                display_path = f"/api/r/*/{'/'.join(parts[4:])}" if len(parts) > 4 else "/api/r/*"

        operation = f"{request.method} {display_path}"
        rec = TimingRecord(
            category="request",
            operation=operation,
            duration_ms=duration_ms,
            status=response.status_code,
        )
        perf_store.record(rec)

        if duration_ms > 200:
            logger.info(
                "[perf] %s → %dms (status %d)", operation, int(duration_ms), response.status_code
            )

        return response


# ---------------------------------------------------------------------------
# Service timing decorator
# ---------------------------------------------------------------------------


def timed(category: str, operation: str | None = None):
    """Decorator that records timing of a function call into perf_store.

    Usage:
        @timed("git", "get_log")
        def get_log(self, ...): ...
    """

    def decorator(func):
        op_name = operation or func.__name__

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                return func(*args, **kwargs)
            finally:
                duration_ms = (time.perf_counter() - start) * 1000
                perf_store.record(
                    TimingRecord(category=category, operation=op_name, duration_ms=duration_ms)
                )
                if duration_ms > 200:
                    logger.info("[perf] %s.%s → %dms", category, op_name, int(duration_ms))

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Repo shape stats (anonymized — no file names or content)
# ---------------------------------------------------------------------------


def collect_repo_shape(repo_path: str) -> dict[str, Any]:
    """Walk a repo and collect anonymized shape statistics.

    Returns counts and depth info — never file names or content.
    """
    from vantage.config import DEFAULT_EXCLUDE_DIRS

    total_files = 0
    total_dirs = 0
    max_depth = 0
    extension_counts: dict[str, int] = {}
    dir_sizes: list[int] = []  # number of entries per directory

    root = str(repo_path)
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune excluded dirs
        dirnames[:] = [
            d for d in dirnames if d not in DEFAULT_EXCLUDE_DIRS and not d.startswith(".")
        ]

        depth = dirpath[len(root) :].count(os.sep)
        max_depth = max(max_depth, depth)
        total_dirs += 1
        dir_sizes.append(len(filenames) + len(dirnames))

        for f in filenames:
            total_files += 1
            ext = os.path.splitext(f)[1].lower() or "(no ext)"
            extension_counts[ext] = extension_counts.get(ext, 0) + 1

    dir_sizes.sort()
    n = len(dir_sizes)

    return {
        "total_files": total_files,
        "total_dirs": total_dirs,
        "max_depth": max_depth,
        "extension_distribution": dict(sorted(extension_counts.items(), key=lambda x: -x[1])[:20]),
        "dir_entry_count": {
            "p50": dir_sizes[int(n * 0.50)] if n else 0,
            "p95": dir_sizes[min(int(n * 0.95), n - 1)] if n else 0,
            "max": dir_sizes[-1] if n else 0,
        },
    }
