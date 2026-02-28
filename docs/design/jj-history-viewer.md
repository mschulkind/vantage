# jj History & Evolution Viewer

Design document for Vantage's Jujutsu (jj) version control integration.

## Problem

Vantage originally only supported Git for version history. Many repositories now use [Jujutsu](https://martinvonz.github.io/jj/) (jj) — a Git-compatible VCS with first-class support for change evolution. jj users expect to see their revision history and, critically, the *evolution* of individual changes over time.

## Architecture

### Detection

jj repos are detected by checking for a `.jj/` directory in the repository root. The `JJService.is_jj` property caches this check.

When a repo is detected as jj-enabled, the frontend automatically switches to jj mode in the history view, with a toggle to switch back to Git view.

### Backend: JJService

A new service class (`src/vantage/services/jj_service.py`) wraps the `jj` CLI via `subprocess.run`. All calls use `--no-pager` to avoid interactive output.

**Key methods:**

| Method | jj Command | Purpose |
|--------|-----------|---------|
| `get_info()` | `jj log -r @ -T change_id.shortest()` | Detect jj, get working copy ID |
| `get_log()` | `jj log --no-graph -T <template>` | Revision history (optionally per-file) |
| `get_evolog()` | `jj evolog -r <rev> --no-graph` | Evolution history for a single change |
| `get_diff()` | `jj diff -r <rev> --git` | Standard git-format diff |
| `get_interdiff()` | `jj diff --from <r1> --to <r2> --git` | Diff between two revisions |

**Template parsing:** `get_log()` uses a custom jj template with Unicode Record Separator (`␞`) as field delimiter. The template outputs one line per revision with fields: `change_id`, `commit_id`, `description`, `author`, `timestamp`, `bookmarks`, `is_working_copy`.

**Evolog parsing:** `get_evolog()` cannot use custom templates because jj's `evolog` command uses the `CommitEvolutionEntry` type (not `Commit`). Instead, it parses the default output format line-by-line, extracting: header fields, description, and operation description.

### API Endpoints

All endpoints exist in both single-repo (`/api/jj/...`) and multi-repo (`/api/r/{repo}/jj/...`) variants.

| Endpoint | Response | Description |
|----------|----------|-------------|
| `GET /jj/info` | `JJInfo` | Is this a jj repo? Working copy change ID? |
| `GET /jj/log?path=&limit=50` | `JJRevision[]` | Revision log, optionally filtered to a file |
| `GET /jj/evolog?rev=@&limit=20` | `JJEvoEntry[]` | How a specific change evolved over time |
| `GET /jj/diff?rev=&path=` | `FileDiff` | Git-format diff for a revision |

Limits are capped server-side (log: 200, evolog: 100) to prevent expensive queries.

### Frontend

**Store (`useJJStore`):** A Zustand store managing jj-specific state, mirroring the pattern of `useGitStore`. Provides `fetchInfo`, `fetchLog`, `fetchEvolog`, `fetchDiff` methods.

**HistoryPage:** Enhanced with a jj/Git mode toggle. When in jj mode, shows a violet-themed timeline of revisions with:
- Working copy indicator (pencil icon + ring highlight)
- Bookmark badges
- Change ID (short) displayed prominently
- Click-to-view diff
- "Show evolution" toggle per revision that expands evolog entries inline

**Evolog entries** show:
- Description at that point in time
- The jj operation that produced this version (e.g., "snapshot working copy", "squash commits into ...")
- Hidden/visible status (hidden entries shown dimmed)
- Commit hash and relative timestamp

## Design Decisions

### CLI vs Library

We use subprocess calls to the `jj` CLI rather than a Rust library because:
1. jj doesn't have a stable Python API
2. The CLI is the supported interface
3. subprocess keeps the dependency simple
4. A 10-second timeout prevents runaway commands

### Separator Character

jj templates concatenate with `++`. We need a separator that:
- Won't appear in commit messages, author names, or bookmark names
- Can be passed as a CLI argument (no null bytes — Python subprocess rejects them)
- Is a single character for simple `.split()`

**Choice:** `␞` (U+241E, Unicode "Symbol for Record Separator"). See [docs/research/jj-cli.md](../research/jj-cli.md) for details.

### Evolog Default Output Parsing

We parse the default `jj evolog` output rather than using templates because `evolog` uses a different template type (`CommitEvolutionEntry`) where standard commit template keywords don't exist. This is fragile but necessary. The parser handles:
- Multi-line entries (header + description + operation)
- Hidden entries marked with `(hidden)`
- Timestamp extraction via date pattern matching
- Commit hash identification via hex character matching

### Graceful Degradation

All `JJService` methods check `self.is_jj` first and return empty/None for non-jj repos. The frontend handles this by falling back to Git-only mode. No errors are shown to the user when jj is not available.

## File Map

```
Backend:
  src/vantage/services/jj_service.py     # JJService class (~300 lines)
  src/vantage/schemas/models.py          # JJRevision, JJEvoEntry, JJInfo
  src/vantage/routers/api.py             # /jj/* endpoints (8 routes)
  tests/test_api.py                      # Basic endpoint tests

Frontend:
  frontend/src/stores/useJJStore.ts      # Zustand store
  frontend/src/stores/useJJStore.test.ts # Store tests (5 tests)
  frontend/src/types/index.ts            # TypeScript interfaces
  frontend/src/pages/HistoryPage.tsx     # Timeline + evolog UI

Docs:
  docs/design/jj-history-viewer.md       # This file
  docs/research/jj-cli.md               # jj CLI reference
```

## Future Work

- **Interdiff viewing:** UI for comparing two evolution entries of the same change
- **File-level evolog:** Show evolution filtered to a specific file path
- **jj op log:** Show the operation log (repo-wide history of all jj operations)
- **Inline evolution in ViewerPage:** Show evolution without navigating to HistoryPage
- **Real-time jj updates:** Watch `.jj/` directory for changes and refresh jj data
