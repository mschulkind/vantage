# Performance Diagnostics Guide

Vantage includes built-in performance instrumentation that collects timing
data for API requests and internal service calls. All output is fully
**anonymized** — no file names, directory names, project names, or content
are ever included.

## What gets collected

| Category | Examples | Anonymized? |
|----------|----------|-------------|
| API request timings | `GET /api/r/*/tree`, `GET /api/r/*/git/recent` | ✅ Repo names replaced with `*` |
| Service call timings | `get_history`, `list_directory`, `get_evolog` | ✅ Only operation names |
| Repo shape stats | File counts, dir counts, max depth, extension distribution | ✅ Labeled `repo_1`, `repo_2`, etc. |
| Slow request log | Duration + endpoint for requests >200ms | ✅ Same as above |

**Never included:** file names, directory names, project/repo names, file
content, git commit messages, user names, or paths.

## How to gather diagnostics

### Step 1: Use Vantage normally

Performance data is collected automatically while the server is running.
There's nothing to enable — the instrumentation is always active with
negligible overhead.

For the most useful data, use Vantage for a representative session first:
browse directories, view files, check git history, etc. The more you
exercise the slow paths, the more useful the data.

### Step 2: Export the report

#### Option A: CLI (recommended)

```bash
# Timing data only (fast, doesn't block the server)
vantage perf-report --json > perf-report.json

# Include repo shape stats (slower — walks the file tree in a background thread)
vantage perf-report --json --shape > perf-report.json

# If running on a different port
vantage perf-report --port 8200 --json > perf-report.json

# Human-readable summary (for your own review)
vantage perf-report
vantage perf-report --shape
```

#### Option B: Direct API call

```bash
# Timing data only (fast)
curl -s http://localhost:8000/api/perf/diagnostics | python -m json.tool > perf-report.json

# Include repo shape stats
curl -s 'http://localhost:8000/api/perf/diagnostics?include_shape=true' | python -m json.tool > perf-report.json
```

### Step 3: Share the JSON file

The `perf-report.json` file is safe to share. Paste its contents into a
GitHub issue, send it to a developer, or attach it to a bug report.

### Step 4: Reset counters (optional)

After exporting, you can clear the collected data to start fresh:

```bash
vantage perf-report --reset          # export + reset in one command
# or
curl -X POST http://localhost:8000/api/perf/reset
```

## Reading the report

### Human-readable output (`vantage perf-report`)

```
═══ Vantage Performance Report ═══

Total API requests: 142

Endpoint Latencies (ms):
  Endpoint                                  Count      p50      p95      p99      max
  ──────────────────────────────────────── ────── ──────── ──────── ──────── ────────
  GET /api/r/*/tree                            38     12.3    145.2    312.0    312.0
  GET /api/r/*/git/recent                      12      8.1     42.5     42.5     42.5
  ...

Service Operation Latencies (ms):
  Operation                             Count      p50      p95      max
  ─────────────────────────────────── ────── ──────── ──────── ────────
  get_recently_changed_files              12     45.2    320.1    320.1
  list_directory                          38      5.3     89.4    145.0
  ...

Slow Requests (>200ms): 3 captured
     312ms  GET /api/r/*/tree
     ...

Repository Shape:
  repo_1:
    Files: 12,345  |  Dirs: 1,234  |  Max depth: 8
    Extensions: .md: 450, .py: 3200, .ts: 2100, ...
    Dir sizes: p50=5, p95=42, max=312
```

### Key things to look for

- **High p95/p99 on endpoints**: Indicates intermittent slowness (often
  the first request after cache expiry or a large directory).
- **`get_recently_changed_files` slow**: Usually means `git log` or
  `git status` is slow — common in repos with many untracked files.
- **`list_directory` slow**: Usually means `_dir_has_markdown()` is
  doing deep recursive walks. Worse in repos with many nested
  non-markdown directories.
- **`get_working_dir_status` slow**: `git status -uall` listing every
  untracked file. Worse in repos with large build output or
  `node_modules` not in `.gitignore`.
- **Repo shape — high file count**: Repos with >5K files will naturally
  be slower. The extension distribution shows whether there are many
  non-markdown files contributing to scan overhead.
- **Repo shape — high max dir entry count**: Directories with hundreds
  of entries are expensive to list with git metadata.

## JSON schema

The JSON output has this structure:

```json
{
  "requests": {
    "total": 142,
    "by_endpoint": {
      "GET /api/r/*/tree": {
        "count": 38,
        "p50": 12.3,
        "p95": 145.2,
        "p99": 312.0,
        "max": 312.0,
        "avg": 34.5
      }
    }
  },
  "services": {
    "total": 891,
    "by_operation": {
      "list_directory": { "count": 38, "p50": 5.3, ... },
      "get_recently_changed_files": { "count": 12, ... }
    }
  },
  "slow_requests": [
    {
      "operation": "GET /api/r/*/tree",
      "duration_ms": 312.0,
      "status": 200,
      "meta": {},
      "timestamp": 1741660000.0
    }
  ],
  "repo_shape": {
    "repo_1": {
      "total_files": 12345,
      "total_dirs": 1234,
      "max_depth": 8,
      "extension_distribution": { ".md": 450, ".py": 3200 },
      "dir_entry_count": { "p50": 5, "p95": 42, "max": 312 }
    }
  }
}
```
