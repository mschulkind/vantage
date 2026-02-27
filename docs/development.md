# Development Guide

Instructions for building, testing, and contributing to Vantage.

## Project Structure

```
src/vantage/          Python backend (FastAPI)
  routers/            HTTP/WebSocket route handlers
  services/           Business logic (filesystem, git, watcher)
  schemas/            Pydantic data models
frontend/             React frontend (Vite + TypeScript)
  src/components/     UI components
  src/stores/         Zustand state management
  src/hooks/          Custom React hooks
  src/pages/          Page-level components
tests/                Backend tests (pytest)
frontend/e2e/         End-to-end tests (Playwright)
docs/                 Documentation
```

## Prerequisites

| Tool                                             | Purpose                                     | Install                                            |
| ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------- |
| [mise](https://mise.jdx.dev/)                    | Manages Node, Python, and Overmind versions | `curl https://mise.jdx.dev/install.sh \| sh`       |
| [uv](https://docs.astral.sh/uv/)                 | Python package/environment manager          | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| [just](https://just.systems/)                    | Command runner                              | `cargo install just` or `brew install just`        |
| [overmind](https://github.com/DarthSim/overmind) | Process manager (runs backend + frontend)   | Managed by mise                                    |

## Setup

```bash
git clone https://github.com/mschulkind/vantage.git
cd vantage
just setup    # Installs Python and Node dependencies
```

## Running in Development

```bash
just dev [PATH]       # Start both frontend + backend (default path: .)
just dev-connect      # View logs (Ctrl+B D to detach)
just dev-stop         # Stop both servers
```

- Frontend dev server: http://localhost:8201 (with HMR)
- Backend API: http://localhost:8200

You can also run them separately:

```bash
just dev-py [PATH]    # Backend only (with reload)
just dev-js           # Frontend only (Vite dev server)
```

## Testing

```bash
just test             # Run all tests (backend + frontend)
just test-py          # Backend tests only
just test-js          # Frontend tests only
just test-e2e         # Playwright end-to-end tests
```

### Coverage

```bash
just coverage         # Both backend and frontend coverage
just coverage-py      # Backend coverage with HTML report
just coverage-js      # Frontend coverage
```

### TDD Workflow

1. **Red:** Write a failing test for the new functionality.
2. **Green:** Write the minimum code to make it pass.
3. **Refactor:** Clean up while keeping tests green.

Bug fixes must include a regression test that demonstrates the bug.

## Code Quality

```bash
just check            # Run everything: format, lint, typecheck, test, build
just format           # Auto-format all code (ruff + prettier)
just lint             # Lint all code (ruff + eslint)
just typecheck        # Type-check Python (basedpyright)
```

**Always run `just check` before committing.** It runs formatting, linting, type-checking, and all tests.

## Building & Installing

```bash
just build            # Build frontend + Python package
just install          # Build and install as a uv tool
just deploy           # Build, install, and restart the systemd service
```

## Backend

- **Framework:** FastAPI with Uvicorn
- **Style:** PEP 8, type hints on all functions, Pydantic models for validation
- **Dependencies:** Managed with `uv add`/`uv remove`
- **Routers** are thin — business logic lives in `services/`

## Frontend

- **Framework:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **State:** Zustand for global state, React hooks for local state
- **Testing:** Vitest + React Testing Library
- **Tests** are co-located with source files (`Component.test.tsx`)

## Additional Docs

- [docs/design/technical_spec.md](design/technical_spec.md) — Architecture and design decisions
