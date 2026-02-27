# Contributing to Vantage

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| [Python 3.13+](https://python.org) | Runtime | Your package manager |
| [uv](https://docs.astral.sh/uv/) | Python package manager | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| [Node.js 22+](https://nodejs.org/) | Frontend build | Your package manager or [nvm](https://github.com/nvm-sh/nvm) |
| [just](https://just.systems/) | Command runner | `cargo install just` or `brew install just` |
| [mise](https://mise.jdx.dev/) | Tool version manager | `curl https://mise.jdx.dev/install.sh \| sh` |

### Getting Started

```bash
git clone https://github.com/mschulkind/vantage.git
cd vantage
just setup    # Install Python and Node dependencies
just dev      # Start backend + frontend dev servers
```

The frontend dev server runs at **http://localhost:8201** with hot reload.

### Running Tests

```bash
just check    # Format, lint, typecheck, and test — run this before every PR
just test     # All tests (backend + frontend)
just test-py  # Backend only (pytest)
just test-js  # Frontend only (vitest)
```

## Making Changes

### Coding Standards

**Backend (Python):**
- Follow PEP 8
- Type hints on all function signatures
- Pydantic models for data validation
- Keep routers thin — business logic goes in `src/vantage/services/`

**Frontend (TypeScript/React):**
- Functional components and hooks
- TypeScript for all files
- Tailwind CSS for styling
- Tests co-located with source files (`Component.test.tsx`)

### Code Quality

Always run `just check` before submitting. It runs:
- `ruff` — Python formatting and linting
- `prettier` — Frontend formatting
- `eslint` — Frontend linting
- `basedpyright` — Python type checking
- `tsc` — TypeScript type checking
- `pytest` — Backend tests
- `vitest` — Frontend tests

### Commit Messages

Use conventional commit style:

```
feat: add WebSocket reconnection with backoff
fix: sidebar tree flickering when multiple files change
docs: update keyboard shortcuts reference
```

## Versioning

Vantage follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (x.0.0) — breaking changes to CLI, config format, or API
- **MINOR** (0.x.0) — new features, backward-compatible
- **PATCH** (0.0.x) — bug fixes, documentation, internal improvements

While in 0.x.y, the API is not considered stable and minor versions may include breaking changes.

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with tests
4. Run `just check` and ensure everything passes
5. Submit a PR with a clear description of what and why

### What Makes a Good PR

- **Small and focused** — one logical change per PR
- **Tested** — new features have tests, bug fixes include regression tests
- **Documented** — update docs if behavior changes

## Bug Reports

Please include:
- Steps to reproduce
- Expected vs actual behavior
- Vantage version (`vantage --version`)
- OS and Python version

## Architecture

See [docs/design/technical_spec.md](docs/design/technical_spec.md) for the full architecture.

**Quick overview:**
- `src/vantage/routers/` — FastAPI HTTP/WebSocket routes
- `src/vantage/services/` — Business logic (filesystem, git, file watching)
- `src/vantage/schemas/` — Pydantic models
- `frontend/src/components/` — React UI components
- `frontend/src/stores/` — Zustand state management
- `frontend/src/hooks/` — Custom React hooks

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
