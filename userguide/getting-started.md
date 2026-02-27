# Getting Started

Vantage is a local Markdown viewer that renders your files the way GitHub does — with live reload, Mermaid diagrams, and Git integration. Point it at a directory and start reading.

> **Platform:** Linux with Python 3.13+. macOS is untested.

## Installation

Vantage is installed from source using [uv](https://docs.astral.sh/uv/) and [just](https://just.systems/).

```bash
git clone https://github.com/mschulkind/vantage.git
cd vantage
just install
```

This builds the frontend, packages the application, and installs the `vantage` command to your PATH (typically `~/.local/bin/vantage`).

### Prerequisites

| Tool                               | Purpose                | Install                                                          |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| [Python 3.13+](https://python.org) | Runtime                | Usually pre-installed or via your package manager                |
| [uv](https://docs.astral.sh/uv/)   | Python package manager | `curl -LsSf https://astral.sh/uv/install.sh \| sh`               |
| [Node.js 22+](https://nodejs.org/) | Building the frontend  | Via your package manager or [nvm](https://github.com/nvm-sh/nvm) |
| [just](https://just.systems/)      | Command runner         | `cargo install just` or `brew install just`                      |

## Quick Start

### Serve a single directory

```bash
vantage serve ~/Documents/notes
```

Open **http://localhost:8000** in your browser. That's it.

You can also just run `vantage` with no arguments — it serves the current directory:

```bash
cd ~/projects/my-docs
vantage
```

### What you'll see

- A **file tree sidebar** on the left showing your Markdown files
- **GitHub-style rendering** of the selected file
- **Live reload** — edit a file in your editor and the browser updates instantly
- **Git integration** — if the directory is a Git repo, you'll see commit info and can view diffs

## Next Steps

- [Configuration](configuration.md) — Customize the server settings and excluded directories
- [Daemon Mode](daemon-mode.md) — Serve multiple directories at once
- [Features](features.md) — Everything Vantage can render and do
- [Keyboard Shortcuts](keyboard-shortcuts.md) — Navigate quickly
