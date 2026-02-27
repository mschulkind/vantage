# Configuration

Vantage works out of the box with zero configuration. For daemon mode (serving multiple directories), you'll need a config file.

## Config File Location

The default config path is:

```
~/.config/vantage/config.toml
```

Generate a starter config with:

```bash
vantage init-config
```

Or specify a custom path:

```bash
vantage init-config --path ~/my-vantage-config.toml
```

## Example Config

```toml
# Server settings
host = "127.0.0.1"
port = 8000

# Directories to serve (each appears in the sidebar)
[[repos]]
name = "notes"
path = "~/Documents/notes"

[[repos]]
name = "work-docs"
path = "~/work/documentation"

[[repos]]
name = "project"
path = "~/code/my-project"
```

Each directory is accessible at `http://localhost:8000/{name}/`.

## Reference

| Key            | Type    | Default       | Description                           |
| -------------- | ------- | ------------- | ------------------------------------- |
| `host`         | string  | `"127.0.0.1"` | Server bind address                   |
| `port`         | integer | `8000`        | Server port                           |
| `repos`        | array   | `[]`          | List of directories to serve          |
| `repos[].name` | string  | _required_    | Display name and URL slug             |
| `repos[].path` | string  | _required_    | Path to the directory (supports `~`)  |
| `exclude_dirs` | array   | _(see below)_ | Directories to hide from all listings |
| `show_hidden`  | boolean | `true`        | Show hidden files/directories (dotfiles) in the sidebar |

## Excluded Directories

By default, Vantage hides common build and dependency directories from the sidebar, file picker, and recent files list:

> `node_modules`, `.venv`, `venv`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.egg-info`, `.tox`, `.nox`, `dist`, `build`, `.cache`, `.git`, `.hg`, `.svn`

You can override this list in your config:

```toml
exclude_dirs = ["node_modules", ".venv", "vendor", "dist", "build"]
```

Setting `exclude_dirs` replaces the default list entirely — include everything you want hidden.

## Environment Variables

When running in single-directory mode (`vantage serve`), you can also configure via environment variables:

| Variable      | Description                    |
| ------------- | ------------------------------ |
| `TARGET_REPO` | Path to the directory to serve |
| `HOST`        | Server bind address            |
| `PORT`        | Server port                    |
| `SHOW_HIDDEN` | Show hidden files (`true`/`false`, default `true`) |
