# Pre-Promote Quality Checks

## Overview

Before any code is promoted from `staging` to `main` (and pushed to the public repo), a comprehensive set of quality checks must pass. This ensures we never push broken or poorly formatted code publicly.

## Running Checks

```bash
# Run all pre-promote checks without promoting
just prepromote

# Promote (runs prepromote automatically, then promotes if all pass)
just promote
```

## Check List

| # | Check | What it catches | Fix command |
|---|-------|-----------------|-------------|
| 1 | Staging has changes | Empty promotion (nothing to release) | Squash changes into staging first |
| 2 | Staging description | Placeholder/missing commit messages | `jj describe -r staging -m "..."` |
| 3 | Python format | Code style violations | `just format-py` |
| 4 | Python lint | Code quality issues (ruff) | `just lint-py` |
| 5 | Backend tests | Regressions in Python code | Fix failing tests |
| 6 | Frontend lint | ESLint violations | `just lint-js` |
| 7 | TypeScript typecheck | Type errors | Fix type errors |
| 8 | Frontend tests | Regressions in React/TS code | Fix failing tests |

## Workflow

```
Developer workflow:
  1. Make changes in working copy
  2. Squash into staging: jj squash --into staging <files>
  3. Update description: jj describe -r staging -m "feat: ..."
  4. Run checks: just prepromote
  5. If all pass: just promote

Promote does:
  1. Runs all prepromote checks (fails fast if any fail)
  2. Fast-forwards main bookmark to staging
  3. Creates fresh staging rev between main and dev
  4. Pushes main to public + private, staging/dev to private
```

## Quick Fix Commands

```bash
# Fix formatting
just format

# Fix lint (auto-fixable)
just lint-py  # Shows issues; use format-py for auto-fix

# Run just the tests
just test

# Run everything (same as prepromote minus jj checks)
just check
```

## Relationship to `just check`

`just check` runs: format → lint → typecheck → test → build-frontend

`just prepromote` adds on top of those:
- Validates staging rev has changes and a proper description
- Runs checks in a pass/fail gate format with clear output
- Is designed to be the final gate before public promotion

Both should pass before promoting. `check` is for day-to-day development; `prepromote` is the release gate.
