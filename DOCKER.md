# Vantage Docker

Run the Vantage markdown viewer in Docker. Each directory gets its own isolated container with auto-assigned ports — view multiple documentation folders simultaneously.

## Quick Start

```bash
# 1. Build the image (one-time)
docker build -t vantage .

# 2. Install the CLI (symlink to your PATH)
ln -sf /path/to/vantage/vantage-docker /usr/local/bin/vantage-docker

# 3. View your docs
cd ~/my-docs
vantage-docker up
```

## Commands

### `vantage-docker up [PATH]`

Start a viewer. Defaults to the current directory.

```bash
vantage-docker up                  # current directory
vantage-docker up ~/projects/docs  # specific path
vantage-docker up -p 9000          # use a specific port (default: auto-assign)
vantage-docker up --build          # rebuild the Docker image before starting
```

Running `up` twice for the same directory is safe — it prints the existing URL.

### `vantage-docker down [PATH]`

Stop a viewer.

```bash
vantage-docker down                # stop viewer for current directory
vantage-docker down ~/projects/docs  # stop a specific one
vantage-docker down --all          # stop all running viewers
```

### `vantage-docker status`

List all running viewers with their ports and directories.

```bash
vantage-docker status
```

### `vantage-docker logs [PATH]`

Tail container logs for a directory's viewer.

```bash
vantage-docker logs                # current directory
vantage-docker logs ~/projects/docs
```

## Live Reload

Files are mounted read-only into the container. When you (or an AI tool) edit a markdown file on the host, the change is detected automatically and the browser refreshes via WebSocket. No manual reload needed.

## Multiple Viewers

Each directory gets its own container on its own port. Run as many as you need:

```bash
cd ~/notes        && vantage-docker up   # → http://localhost:54821
cd ~/work/specs   && vantage-docker up   # → http://localhost:61033
cd ~/project/docs && vantage-docker up   # → http://localhost:49217

vantage-docker status                    # see all three
vantage-docker down --all                # stop everything
```

## Docker Compose

Alternatively, use the included `docker-compose.yml` directly:

```bash
VANTAGE_DOCS=~/my-docs docker compose up -d
VANTAGE_DOCS=~/my-docs VANTAGE_PORT=9000 docker compose up -d
```

## Building the Image

The image is built automatically on first `vantage-docker up` if it doesn't exist. To rebuild manually:

```bash
docker build -t vantage .

# or via the CLI
vantage-docker up --build
```
