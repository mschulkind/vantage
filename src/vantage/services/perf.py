"""Performance instrumentation for Vantage.

Provides request timing middleware and service-level timing helpers.
Data is stored in an in-memory ring buffer for diagnostics export.
"""

from __future__ import annotations

import functools
import logging
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Ring buffer for timing records
# ---------------------------------------------------------------------------

_MAX_RECORDS = 2000


@dataclass(slots=True)
class TimingRecord:
    """A single timing measurement."""

    category: str  # "request", "git", "fs", "jj"
    operation: str  # e.g. "GET /api/tree", "git_log", "list_directory"
    duration_ms: float
    timestamp: float = field(default_factory=time.time)
    status: int | None = None  # HTTP status for requests


def _compute_percentiles(durations: list[float]) -> dict[str, float]:
    """Compute percentile stats from a pre-sorted list of durations."""
    n = len(durations)
    if n == 0:
        return {}
    durations.sort()
    return {
        "count": n,
        "p50": round(durations[int(n * 0.50)], 1),
        "p95": round(durations[min(int(n * 0.95), n - 1)], 1),
        "p99": round(durations[min(int(n * 0.99), n - 1)], 1),
        "max": round(durations[-1], 1),
        "avg": round(sum(durations) / n, 1),
    }


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
    def request_count(self) -> int:
        return self._request_count

    @property
    def service_call_count(self) -> int:
        return self._service_call_count

    @property
    def buffer_size(self) -> int:
        return len(self._records)

    def clear(self) -> None:
        self._records.clear()
        self._request_count = 0
        self._service_call_count = 0

    # ---- Single-pass aggregation ----

    def by_operation(self, category: str | None = None) -> dict[str, dict[str, float]]:
        """Group percentiles by operation name — single pass O(n)."""
        buckets: dict[str, list[float]] = defaultdict(list)
        for r in self._records:
            if category is None or r.category == category:
                buckets[r.operation].append(r.duration_ms)
        return {op: _compute_percentiles(durations) for op, durations in sorted(buckets.items())}

    def slow_requests(self, threshold_ms: float = 500, limit: int = 20) -> list[dict]:
        """Return the slowest requests above threshold."""
        slow = [
            {
                "operation": r.operation,
                "duration_ms": round(r.duration_ms, 1),
                "status": r.status,
                "timestamp": r.timestamp,
            }
            for r in self._records
            if r.category == "request" and r.duration_ms >= threshold_ms
        ]
        slow.sort(key=lambda x: x["duration_ms"], reverse=True)
        return slow[:limit]

    def build_diagnostics(self) -> dict:
        """Build the full diagnostics dict — all computation in one call."""
        t0 = time.perf_counter()

        buf_size = len(self._records)
        logger.info(
            "[perf:diag] building diagnostics: buffer=%d requests=%d service_calls=%d",
            buf_size,
            self._request_count,
            self._service_call_count,
        )

        t1 = time.perf_counter()
        by_endpoint = self.by_operation(category="request")
        t2 = time.perf_counter()
        logger.info(
            "[perf:diag] by_endpoint: %d ops in %.1fms",
            len(by_endpoint),
            (t2 - t1) * 1000,
        )

        by_svc = self.by_operation(category=None)
        t3 = time.perf_counter()
        logger.info(
            "[perf:diag] by_operation(all): %d ops in %.1fms",
            len(by_svc),
            (t3 - t2) * 1000,
        )

        slow = self.slow_requests(threshold_ms=200)
        t4 = time.perf_counter()
        logger.info(
            "[perf:diag] slow_requests: %d found in %.1fms",
            len(slow),
            (t4 - t3) * 1000,
        )

        result = {
            "requests": {
                "total": self._request_count,
                "by_endpoint": by_endpoint,
            },
            "services": {
                "total": self._service_call_count,
                "by_operation": by_svc,
            },
            "slow_requests": slow,
            "meta": {
                "buffer_size": buf_size,
                "buffer_max": self._records.maxlen,
                "build_ms": round((t4 - t0) * 1000, 1),
            },
        }

        logger.info("[perf:diag] total build: %.1fms", (t4 - t0) * 1000)
        return result


# Global store instance
perf_store = PerfStore()


# ---------------------------------------------------------------------------
# FastAPI middleware
# ---------------------------------------------------------------------------


class PerfMiddleware(BaseHTTPMiddleware):
    """Records request timing for all /api/ routes."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Skip non-API and perf endpoints entirely
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
        perf_store.record(
            TimingRecord(
                category="request",
                operation=operation,
                duration_ms=duration_ms,
                status=response.status_code,
            )
        )

        # Log every request with timing for debugging
        if duration_ms > 1000:
            logger.warning(
                "[perf] SLOW %s → %dms (status %d)",
                operation,
                int(duration_ms),
                response.status_code,
            )
        elif duration_ms > 200:
            logger.info(
                "[perf] %s → %dms (status %d)",
                operation,
                int(duration_ms),
                response.status_code,
            )
        else:
            logger.debug(
                "[perf] %s → %dms (status %d)",
                operation,
                int(duration_ms),
                response.status_code,
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
                if duration_ms > 1000:
                    logger.warning("[perf] SLOW %s.%s → %dms", category, op_name, int(duration_ms))
                elif duration_ms > 200:
                    logger.info("[perf] %s.%s → %dms", category, op_name, int(duration_ms))
                else:
                    logger.debug("[perf] %s.%s → %dms", category, op_name, int(duration_ms))

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

    t0 = time.perf_counter()
    total_files = 0
    total_dirs = 0
    max_depth = 0
    extension_counts: dict[str, int] = {}
    dir_sizes: list[int] = []

    root = str(repo_path)
    for dirpath, dirnames, filenames in os.walk(root):
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

    elapsed_ms = (time.perf_counter() - t0) * 1000
    logger.info(
        "[perf:shape] walked repo: %d files, %d dirs, depth %d in %.0fms",
        total_files,
        total_dirs,
        max_depth,
        elapsed_ms,
    )

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
        "walk_ms": round(elapsed_ms, 1),
    }
