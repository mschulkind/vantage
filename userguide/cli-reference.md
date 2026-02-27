# CLI Reference

All available `vantage` commands and their options.

## `vantage` / `vantage serve`

Start the Vantage server for a single directory.

```bash
vantage [PATH]
vantage serve [PATH] [--host HOST] [--port PORT] [--show-hidden | --no-show-hidden]
```

| Argument/Option          | Default                 | Description                         |
| ------------------------ | ----------------------- | ----------------------------------- |
| `PATH`                   | `.` (current directory) | Directory containing Markdown files |
| `--host`                 | `127.0.0.1`             | Server bind address                 |
| `--port`                 | `8000`                  | Server port                         |
| `--show-hidden/--no-show-hidden` | `--show-hidden` | Show/hide dotfiles in sidebar       |

Running `vantage` with no subcommand is equivalent to `vantage serve .`.

---

## `vantage daemon`

Start the daemon to serve multiple directories from a config file.

```bash
vantage daemon [--config PATH] [--host HOST] [--port PORT]
```

| Option           | Default                         | Description                       |
| ---------------- | ------------------------------- | --------------------------------- |
| `--config`, `-c` | `~/.config/vantage/config.toml` | Path to the config file           |
| `--host`         | From config                     | Override the host from the config |
| `--port`         | From config                     | Override the port from the config |

See [Daemon Mode](daemon-mode.md) for details on the config file format.

---

## `vantage init-config`

Generate an example configuration file for daemon mode.

```bash
vantage init-config [--path PATH] [--force]
```

| Option          | Default                         | Description                       |
| --------------- | ------------------------------- | --------------------------------- |
| `--path`, `-p`  | `~/.config/vantage/config.toml` | Where to create the config file   |
| `--force`, `-f` |                                 | Overwrite an existing config file |

---

## `vantage build`

Build a static site from a directory of Markdown files. The output is a self-contained folder that can be deployed to any static hosting provider.

```bash
vantage build PATH [--output DIR] [--name NAME] [--base-path PATH] [--frontend-dist DIR]
```

| Argument/Option   | Default            | Description                                                                    |
| ----------------- | ------------------ | ------------------------------------------------------------------------------ |
| `PATH`            | _required_         | Directory containing Markdown files                                            |
| `--output`, `-o`  | `./vantage-static` | Output directory                                                               |
| `--name`, `-n`    | Directory name     | Display name shown in the UI                                                   |
| `--base-path`     | `/`                | URL base path for deployment (e.g., `/docs/` if hosted at `example.com/docs/`) |
| `--frontend-dist` | _(auto-build)_     | Path to a pre-built frontend dist directory                                    |

See [Static Sites](static-sites.md) for a full guide on this workflow.

---

## `vantage install-service`

Install Vantage as a systemd user service that starts on login.

```bash
vantage install-service
```

This creates `~/.config/systemd/user/vantage.service`. See [Daemon Mode](daemon-mode.md#running-as-a-systemd-service) for the full setup steps.
