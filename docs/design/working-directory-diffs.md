# Working Directory Diffs

Design document for Vantage's uncommitted change (working directory diff) feature.

## Problem

Previously, Vantage only showed committed diffs from git history. Users couldn't see uncommitted changes — the most common state when actively editing files.

## Design

### File Status Categories

Every file in the repo has one of these statuses (from `git status --porcelain`):

| Status | Meaning | Diff Source |
|--------|---------|-------------|
| `modified` | Tracked file with uncommitted changes | `git diff HEAD -- <path>` |
| `added` | New file staged for commit | `git diff HEAD -- <path>` |
| `deleted` | Tracked file deleted in working tree | `git diff HEAD -- <path>` |
| `untracked` | New file not yet tracked by git | Synthetic diff (all `+` lines) |
| `null` | Clean tracked file (no changes) | N/A |

### API

**`GET /api/git/status?path=<file>`** → `FileStatus`

Returns both the last commit touching this file AND the current working tree status:

```json
{
  "last_commit": {
    "hexsha": "abc123...",
    "author_name": "...",
    "date": "...",
    "message": "..."
  },
  "git_status": "modified"
}
```

**`GET /api/git/diff/working?path=<file>`** → `FileDiff`

Returns the uncommitted diff for a file. Uses a sentinel `commit_hexsha: "working"` to distinguish from committed diffs.

### Backend Implementation

In `GitService`:

- **`get_working_dir_diff(path)`**: Runs `git diff HEAD -- <path>` for tracked files. For untracked files, calls `_diff_untracked_file()` which generates a synthetic all-add diff.
- **`_diff_untracked_file(path)`**: Reads the file content and produces a `FileDiff` where every line is a `+` (add) line.
- The diff is returned as a standard `FileDiff` model with `commit_hexsha="working"` as a sentinel value.

### Frontend Implementation

**ViewerPage header bar:**
- A green badge appears when a file has uncommitted changes (modified/added) or is untracked
- Clicking the badge opens the working directory diff in `DiffViewer`
- The existing commit SHA link still opens the last committed diff

**DiffViewer:**
- Detects working diffs via `diff.commit_hexsha === "working"`
- Shows a green header ("Uncommitted Changes") for working diffs vs amber for committed diffs
- No SHA displayed for working diffs

### Sentinel Value

We use `commit_hexsha: "working"` as a sentinel to distinguish working directory diffs from committed diffs. This avoids adding a separate field to the `FileDiff` model and is checked in both backend and frontend code.

## File Changes

```
src/vantage/services/git_service.py    # get_working_dir_diff(), _diff_untracked_file()
src/vantage/routers/api.py             # GET /git/diff/working, enhanced /git/status
src/vantage/schemas/models.py          # FileStatus.git_status replaces .is_modified
frontend/src/stores/useGitStore.ts     # fetchWorkingDiff(), fileGitStatus
frontend/src/types/index.ts            # FileStatus interface
frontend/src/pages/ViewerPage.tsx      # Modified badge, click handlers
frontend/src/components/DiffViewer.tsx  # Working diff header styling
```
