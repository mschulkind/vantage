# Vantage Justfile

# Socket path — single source of truth
export OVERMIND_SOCKET := justfile_directory() / ".overmind.sock"

# Fixed title so we can reliably find orphaned processes
export OVERMIND_TITLE := "vantage-dev"

default:
    @just --list

# Setup the entire project
setup:
    uv sync
    cd frontend && npm install

# Run the backend server in development mode
dev-py path=".":
    uv run vantage {{path}}

dev-js:
    cd frontend && npm run dev

# Start dev servers (idempotent — safe to call repeatedly)
dev path=".":
    #!/usr/bin/env bash
    set -euo pipefail
    # If overmind is already running and responsive, just say so
    if [ -e "$OVERMIND_SOCKET" ] && overmind status &>/dev/null; then
        echo "Dev servers already running. Use 'just dev-stop' to stop or 'just dev-restart' to restart."
        exit 0
    fi
    # Clean up any stale state (dead socket, orphaned processes)
    rm -f "$OVERMIND_SOCKET"
    pkill -f "overmind-${OVERMIND_TITLE}" 2>/dev/null || true
    sleep 0.5
    TARGET_REPO={{path}} overmind start -D
    echo "Dev servers started. Use 'just dev-connect' to view logs."

# Stop the dev servers (idempotent — safe to call repeatedly)
dev-stop:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -e "$OVERMIND_SOCKET" ]; then
        # Try graceful quit via the socket
        if overmind quit 2>/dev/null; then
            # Wait for clean shutdown
            for i in $(seq 1 30); do
                [ ! -e "$OVERMIND_SOCKET" ] && break
                sleep 0.1
            done
        fi
        # Remove stale socket if still present
        rm -f "$OVERMIND_SOCKET"
    fi
    # Kill any orphaned overmind/tmux processes for this project
    pkill -f "overmind-${OVERMIND_TITLE}" 2>/dev/null || true
    echo "Dev servers stopped."

# Restart dev servers
dev-restart path=".":
    just dev-stop
    just dev {{path}}

# Connect to running dev servers (view logs)
dev-connect:
    overmind connect

check: format lint typecheck test build-frontend

format-py:
    uv run ruff check --fix .
    uv run ruff format .

format-js:
    cd frontend && npm run format || true

format: format-py format-js

lint-py:
    uv run ruff check .

lint-js:
    cd frontend && npm run lint || true

lint: lint-py lint-js

typecheck:
    uv run basedpyright src/ --warnings || true

test-py:
    uv run python -m pytest tests/ -v

test-js:
    cd frontend && npm run test

test-e2e:
    cd frontend && npx playwright test

test: test-py test-js

coverage-py:
    uv run python -m pytest tests/ -v --cov=src/vantage --cov-report=term-missing --cov-report=html

coverage-js:
    cd frontend && npm run test:coverage

coverage: coverage-py coverage-js

# Build the frontend
build-frontend:
    cd frontend && npm run build

# Copy frontend dist into the Python package
bundle-frontend: build-frontend
    python3 -c "import shutil; from pathlib import Path; dst=Path('src/vantage/frontend_dist'); shutil.rmtree(dst, ignore_errors=True); shutil.copytree('frontend/dist', dst)"

# Build the Python package (includes frontend)
build: bundle-frontend
    #!/usr/bin/env bash
    set -euo pipefail
    rm -rf dist/

    # Compute version: use base version from pyproject.toml, append git metadata
    base_version=$(python3 -c "
    import tomllib
    with open('pyproject.toml', 'rb') as f:
        print(tomllib.load(f)['project']['version'])
    ")

    # Check if current commit is a clean tagged release
    current_tag=$(git tag --points-at HEAD 2>/dev/null | grep "^v" | head -1 || true)
    is_dirty=$(git diff --quiet 2>/dev/null && echo "false" || echo "true")

    if [[ -n "$current_tag" && "$is_dirty" == "false" ]]; then
        # Clean tagged release — use version as-is
        build_version="$base_version"
    else
        # Dev build — append git hash and optional dirty flag
        short_hash=$(git rev-parse --short=8 HEAD 2>/dev/null || echo "unknown")
        build_version="${base_version}.dev0+g${short_hash}"
        if [[ "$is_dirty" == "true" ]]; then
            build_version="${build_version}.dirty"
        fi
    fi

    echo "Building version: $build_version"

    # Temporarily patch pyproject.toml version for the build
    sed -i "s/^version = \".*\"/version = \"${build_version}\"/" pyproject.toml
    trap 'git checkout pyproject.toml 2>/dev/null || true' EXIT
    uv build

# Install the built package as a uv tool
install: build
    #!/usr/bin/env bash
    set -euo pipefail
    whl=(dist/*.whl)
    uv tool install "${whl[0]}" --force

# Uninstall the uv tool
uninstall:
    uv tool uninstall vantage || true

# Reinstall the package (useful for development)
reinstall: uninstall install

# Restart the systemd service (after install)
restart-service:
    systemctl --user restart vantage

# Full rebuild and restart: build, install, restart service
deploy: install restart-service
    @echo "Vantage deployed and service restarted"

# Show service status
status:
    systemctl --user status vantage

# View service logs
logs:
    journalctl --user -u vantage -f

# Clean build artifacts (optional, for fresh builds)
clean:
    python3 -c "import shutil; from pathlib import Path; \
        [shutil.rmtree(p) for p in [Path('dist'), Path('build'), Path('src/vantage/frontend_dist'), Path('src/vantage.egg-info')] if p.exists()]"

# Build the static docs site and preview the full landing page + docs locally
dev-site:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "--- Building frontend ---"
    cd frontend && npm run build && cd ..
    echo "--- Building static user guide ---"
    uv run vantage build userguide/ -o site/docs --frontend-dist frontend/dist -n "Vantage User Guide" --base-path /docs/
    echo "--- Symlinking docs into landing/public for dev server ---"
    ln -sfn ../../site/docs landing/public/docs
    echo "--- Starting Astro dev server (landing + docs) ---"
    echo "Open http://localhost:4321"
    cd landing && npm run dev

# Push bookmarks to their respective git remotes
push:
    jj git push --bookmark main --remote public
    jj git push --bookmark main --bookmark dev --bookmark staging --remote private

# Pre-promote quality gate: all checks must pass before public promotion
prepromote:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== Pre-promote quality checks ==="
    FAILED=0
    step() { echo ""; echo "--- [$1] $2 ---"; }

    # 1. Staging has changes
    step "1/8" "Staging has changes"
    if [ -z "$(jj diff -r staging --stat 2>/dev/null)" ]; then
        echo "FAIL: staging has no changes to promote."
        exit 1
    fi
    echo "OK"

    # 2. Description is proper
    step "2/8" "Staging description"
    DESC="$(jj log -r staging --no-graph -T description 2>/dev/null)"
    if [ -z "$DESC" ] || echo "$DESC" | grep -qi "^staging:"; then
        echo "FAIL: staging description must be a proper release description."
        echo "Current: $DESC"
        echo "Update with: jj describe -r staging -m \"your description\""
        exit 1
    fi
    echo "OK: $DESC"

    # 3. Python formatting
    step "3/8" "Python format check"
    if ! uv run ruff format --check src/ tests/ 2>&1; then
        echo "FAIL: Run 'just format-py' to fix."
        FAILED=1
    else
        echo "OK"
    fi

    # 4. Python lint
    step "4/8" "Python lint"
    if ! uv run ruff check src/ tests/ 2>&1; then
        echo "FAIL: Run 'just lint-py' to fix."
        FAILED=1
    else
        echo "OK"
    fi

    # 5. Backend tests
    step "5/8" "Backend tests"
    if ! uv run python -m pytest tests/ -q --tb=short 2>&1; then
        echo "FAIL: Backend tests failed."
        FAILED=1
    else
        echo "OK"
    fi

    # 6. Frontend lint
    step "6/8" "Frontend lint"
    if ! (cd frontend && npx eslint src/ --max-warnings=0 2>&1); then
        echo "FAIL: Run 'just lint-js' to fix."
        FAILED=1
    else
        echo "OK"
    fi

    # 7. TypeScript typecheck
    step "7/8" "TypeScript typecheck"
    if ! (cd frontend && npx tsc --noEmit 2>&1); then
        echo "FAIL: TypeScript errors found."
        FAILED=1
    else
        echo "OK"
    fi

    # 8. Frontend tests
    step "8/8" "Frontend tests"
    if ! (cd frontend && npm run test 2>&1); then
        echo "FAIL: Frontend tests failed."
        FAILED=1
    else
        echo "OK"
    fi

    echo ""
    if [ "$FAILED" -ne 0 ]; then
        echo "=== PRE-PROMOTE FAILED ==="
        echo "Fix the issues above before promoting."
        exit 1
    fi
    echo "=== ALL PRE-PROMOTE CHECKS PASSED ==="

# Promote staging to main: run checks, move public head forward, create fresh staging, push
promote: prepromote
    #!/usr/bin/env bash
    set -euo pipefail
    DESC="$(jj log -r staging --no-graph -T description 2>/dev/null)"
    echo "--- Promoting staging to main ---"
    echo "Description: $DESC"
    # Fast-forward main to staging (no rewriting, just move the bookmark)
    jj bookmark set main -r staging
    # Create fresh staging between new main and dev
    jj new --insert-after main --insert-before dev
    jj bookmark set staging -r @
    jj desc -m "Staging: accumulating changes for next public release"
    jj edit dev
    echo "--- Pushing ---"
    just push
    echo "Promote complete."

# Create a GitHub release from the latest CHANGELOG.md entry
release:
    ./scripts/release.sh

# Dry-run release (preview notes without creating release)
release-dry:
    ./scripts/release.sh --dry-run
