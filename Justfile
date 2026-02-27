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
    uv run pytest tests/ -v

test-js:
    cd frontend && npm run test

test-e2e:
    cd frontend && npx playwright test

test: test-py test-js

coverage-py:
    uv run pytest tests/ -v --cov=src/vantage --cov-report=term-missing --cov-report=html

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
    uv build

# Install the built package as a uv tool
install: build
    uv tool install dist/*.whl --force

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
