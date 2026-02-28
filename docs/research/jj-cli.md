# jj (Jujutsu) CLI Reference

Research notes for integrating jj version control into Vantage.

## Overview

[Jujutsu](https://martinvonz.github.io/jj/) is a Git-compatible VCS with first-class support for change evolution (tracking how a revision changes over time through rebases, squashes, description edits, etc.).

Vantage detects jj by checking for a `.jj/` directory in the repository root.

## Key Commands

### `jj log`

Shows revision history. Supports custom templates for machine-parseable output.

```bash
# Human-readable
jj log --no-pager --no-graph --limit 10

# Machine-parseable with custom template
jj log --no-pager --no-graph --limit 10 -T '<template>'
```

**Template type:** `Commit` — has methods like `change_id`, `commit_id`, `description`, `author`, `bookmarks`, `tags`, `self.current_working_copy()`.

**Important:** Use `self.current_working_copy()`, NOT `self.working_copy()` (the latter doesn't exist and causes a parse error).

### `jj evolog`

Shows the *evolution log* for a specific revision — every version of that change across operations (squashes, rebases, amends, description changes).

```bash
jj evolog -r @ --no-pager --no-graph --limit 20
```

**Template type:** `CommitEvolutionEntry` — this is a *different* type from `Commit`. Keywords like `change_id` don't exist directly. The default output format must be parsed instead of using custom templates.

**Default output format:**
```
qnpvpkwm hidden mschulkind@gmail.com 2026-02-28 06:33:53.000 +00:00 30eb8bd2
(no description set)
-- operation: 8bf3de68 snapshot working copy
```

Each entry has:
- Header line: change_id, optional "hidden", author email, timestamp, commit hash
- Description line(s)
- Operation line: `-- operation: <op_hash> <description>`

### `jj diff`

Shows the diff for a revision in git format.

```bash
# Diff for a specific revision
jj diff -r <rev> --git

# Diff for a specific file in a revision
jj diff -r <rev> --git -- path/to/file.md

# Diff between two revisions (interdiff)
jj diff --from <rev1> --to <rev2> --git
```

Output is standard git diff format, compatible with existing diff parsers.

### `jj status`

Shows working copy status. Less useful for machine parsing than `jj log -r @`.

## Template Syntax

jj uses a custom template language for formatting output.

### String Concatenation

```
expr1 ++ "literal" ++ expr2
```

### Available Methods (Commit type)

| Method | Returns | Description |
|--------|---------|-------------|
| `change_id` | `ChangeId` | The change ID |
| `change_id.shortest()` | `str` | Shortest unique prefix |
| `commit_id` | `CommitId` | The commit hash |
| `commit_id.short(N)` | `str` | First N chars of hash |
| `description` | `str` | Full description |
| `description.first_line()` | `str` | First line only |
| `author.name()` | `str` | Author name |
| `author.email()` | `str` | Author email |
| `author.timestamp()` | `Timestamp` | Author timestamp |
| `author.timestamp().utc()` | `str` | UTC formatted timestamp |
| `bookmarks` | `List<Bookmark>` | Branch bookmarks |
| `bookmarks.map(\|b\| b.name()).join(",")` | `str` | Comma-separated bookmark names |
| `tags` | `List<Tag>` | Tags |
| `self.current_working_copy()` | `bool` | Is this the working copy? |

### Separator Strategy

**Problem:** Null bytes (`\x00`) cannot be passed as subprocess arguments — Python's `subprocess.run` raises `ValueError: embedded null byte`.

**Solution:** Use Unicode Record Separator character `␞` (U+241E) as field separator. This character is extremely unlikely to appear in commit messages or author names.

```python
_SEP = "␞"
sep_expr = f' ++ "{_SEP}" ++ '
template = sep_expr.join(["change_id.shortest()", "description.first_line()", ...])
```

## Gotchas

1. **`working_copy()` vs `current_working_copy()`**: The method on `Commit` is `current_working_copy()`. Using `working_copy()` produces: `Method 'working_copy' doesn't exist for type 'Commit'`.

2. **`evolog` template type**: `jj evolog` uses `CommitEvolutionEntry`, not `Commit`. Custom templates that work with `jj log` will fail with `evolog`. Parse default output instead.

3. **Null bytes in arguments**: Can't use `\x00` as separator in templates passed via CLI. Use a Unicode character instead.

4. **`--no-pager` and `--no-graph`**: Always use both flags when parsing output programmatically.

5. **Revset expressions with parentheses**: Must be quoted in bash: `jj new 'root()'` not `jj new root()` (bash interprets unquoted parens as function definition syntax).

6. **Timeout**: jj operations can occasionally hang (e.g., when the working copy snapshot is large). Use a subprocess timeout (default: 10s).

## Revision Specifiers

| Specifier | Meaning |
|-----------|---------|
| `@` | Working copy revision |
| `@-` | Parent of working copy |
| `<change_id>` | Specific change (e.g., `wosnyxlu`) |
| `<bookmark>` | Bookmark name (e.g., `main`, `staging`) |

## File Structure in Vantage

```
src/vantage/services/jj_service.py    # JJService class
src/vantage/schemas/models.py         # JJRevision, JJEvoEntry, JJInfo
src/vantage/routers/api.py            # /jj/* endpoints
frontend/src/stores/useJJStore.ts     # Zustand store
frontend/src/types/index.ts           # TypeScript interfaces
frontend/src/pages/HistoryPage.tsx    # jj timeline + evolog UI
```
