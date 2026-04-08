# Vantage Justfile

# Socket path — single source of truth
export OVERMIND_SOCKET := justfile_directory() / ".overmind.sock"

# Fixed title so we can reliably find orphaned processes
export OVERMIND_TITLE := "vantage-dev"

default:
    @just --list

# Setup the entire project (never modifies tracked files)
setup:
    #!/usr/bin/env bash
    set -euo pipefail
    # Create a relocatable venv so shebangs use #!/usr/bin/env python
    # instead of absolute paths — works across host and jail mounts.
    if [ ! -d .venv ] || ! head -1 .venv/bin/pip | grep -q 'env python'; then
        rm -rf .venv
        uv venv --relocatable
    fi
    uv sync --frozen
    cd frontend && npm ci

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

# Read-only verification (used by pre-commit hook and CI)
check-ci: lint-ci typecheck test

lint-ci: lint-py lint-js
    uv run ruff format --check .
    cd frontend && npm run format:check

format-py:
    uv run ruff check --fix .
    uv run ruff format .

format-js:
    cd frontend && npm run format

format: format-py format-js

lint-py:
    uv run ruff check .

lint-js:
    cd frontend && npm run lint

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

# Ensure venv + deps exist (idempotent, no-op if already set up)
_ensure-env:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d .venv ] || ! head -1 .venv/bin/pip 2>/dev/null | grep -q 'env python'; then
        rm -rf .venv
        uv venv --relocatable
    fi
    uv sync --frozen
    if [ ! -d frontend/node_modules ]; then
        cd frontend && npm ci
    fi

# Build the Python package (includes frontend)
# Never modifies tracked files — patches version in a temp copy of pyproject.toml.
build: _ensure-env bundle-frontend
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

    # Temporarily patch pyproject.toml for the build, with robust restore.
    # Save original, patch in-place, build, then always restore from backup.
    cp pyproject.toml pyproject.toml.bak
    restore() { mv -f pyproject.toml.bak pyproject.toml; }
    trap restore EXIT
    python3 -c "
    import re, pathlib
    p = pathlib.Path('pyproject.toml')
    p.write_text(re.sub(r'^version = \".*\"', 'version = \"${build_version}\"', p.read_text(), count=1, flags=re.M))
    "
    uv build
    restore
    trap - EXIT

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

# ── Release ─────────────────────────────────────────────────────────

# Release both packages: tag, build, publish to npm, create GitHub release.
# Usage: just release patch  (or: minor, major)
release bump="patch": _ensure-env
    #!/usr/bin/env bash
    set -euo pipefail

    # — 1. Preflight: run all checks on current code —
    just check-ci

    # — 2. Compute new versions —
    cur_py=$(python3 -c "import tomllib; print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])")
    IFS='.' read -r maj min pat <<< "$cur_py"
    case "{{bump}}" in
        major) new_py="$((maj+1)).0.0" ;;
        minor) new_py="${maj}.$((min+1)).0" ;;
        patch) new_py="${maj}.${min}.$((pat+1))" ;;
        *)     echo "Usage: just release [major|minor|patch]"; exit 1 ;;
    esac

    cur_npm=$(node -p "require('./packages/vantage-md/package.json').version")
    IFS='.' read -r nmaj nmin npat <<< "$cur_npm"
    case "{{bump}}" in
        major) new_npm="$((nmaj+1)).0.0" ;;
        minor) new_npm="${nmaj}.$((nmin+1)).0" ;;
        patch) new_npm="${nmaj}.${nmin}.$((npat+1))" ;;
    esac

    echo ""
    echo "Python:  ${cur_py} → ${new_py}"
    echo "npm:     ${cur_npm} → ${new_npm}"
    echo ""
    read -rp "Proceed? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

    # — 3. Bump versions in source —
    sed -i "s/^version = \"${cur_py}\"/version = \"${new_py}\"/" pyproject.toml
    cd packages/vantage-md && npm version "${new_npm}" --no-git-tag-version && cd ../..
    cd frontend && npm install && cd ..

    # — 4. Commit + tag —
    git add pyproject.toml packages/vantage-md/package.json frontend/package-lock.json
    git commit -m "release: v${new_py} / vantage-md@${new_npm}" --no-verify
    git tag -a "v${new_py}" -m "v${new_py}"

    # — 5. Build both packages —
    just build
    cd packages/vantage-md && npx tsup && cd ../..

    # — 6. Push + publish —
    git push origin main --follow-tags
    cd packages/vantage-md && npm publish && cd ../..

    # — 7. GitHub release (with Python wheel + tarball as assets) —
    gh release create "v${new_py}" dist/*.whl dist/*.tar.gz \
        --title "v${new_py}" \
        --generate-notes

    echo ""
    echo "Released: vantage v${new_py} + vantage-md@${new_npm}"

# Release only the npm package (vantage-md).
# Usage: just release-npm patch
release-npm bump="patch": _ensure-env
    #!/usr/bin/env bash
    set -euo pipefail

    # — 1. Preflight —
    just check-ci

    # — 2. Compute new version —
    cur=$(node -p "require('./packages/vantage-md/package.json').version")
    IFS='.' read -r maj min pat <<< "$cur"
    case "{{bump}}" in
        major) new="$((maj+1)).0.0" ;;
        minor) new="${maj}.$((min+1)).0" ;;
        patch) new="${maj}.${min}.$((pat+1))" ;;
        *)     echo "Usage: just release-npm [major|minor|patch]"; exit 1 ;;
    esac

    echo ""
    echo "vantage-md: ${cur} → ${new}"
    read -rp "Proceed? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

    # — 3. Bump, build, commit —
    cd packages/vantage-md
    npm version "${new}" --no-git-tag-version
    npx tsup
    cd ../..
    cd frontend && npm install && cd ..

    git add packages/vantage-md/package.json frontend/package-lock.json
    git commit -m "release: vantage-md@${new}" --no-verify
    git tag -a "vantage-md@${new}" -m "vantage-md@${new}"

    # — 4. Push + publish —
    git push origin main --follow-tags
    cd packages/vantage-md && npm publish

    echo ""
    echo "Released: vantage-md@${new}"

# Build the static user guide docs
build-docs:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "--- Building frontend ---"
    cd frontend && npm run build && cd ..
    echo "--- Building static user guide ---"
    uv run vantage build userguide/ -o dist/docs --frontend-dist frontend/dist -n "Vantage User Guide"
    rm -f dist/docs/_redirects  # Workers routing, not Pages
    echo "--- Done: dist/docs/ ---"

# Deploy user guide to Cloudflare Workers
deploy-docs: build-docs
    npx wrangler deploy --config docs-wrangler.toml

