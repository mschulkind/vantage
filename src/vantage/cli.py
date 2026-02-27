import os
import sys
from pathlib import Path

import click
import uvicorn

from vantage.config import DEFAULT_CONFIG_PATH, DaemonConfig, create_example_config

_LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _warn_nonlocal(host: str | list[str]) -> None:
    """Print a warning when binding to a non-localhost address."""
    hosts = [host] if isinstance(host, str) else host
    non_local = [h for h in hosts if h not in _LOCAL_HOSTS]
    if non_local:
        click.secho(
            f"⚠ WARNING: Binding to non-localhost address(es): {', '.join(non_local)}. "
            "Vantage has no authentication — all files in the served directory will be accessible.",
            fg="yellow",
            err=True,
        )


@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx):
    """Vantage: View LLM-generated Markdown files with GitHub-like rendering."""
    if ctx.invoked_subcommand is None:
        ctx.invoke(serve)


@cli.command()
@click.argument(
    "repo_path", type=click.Path(exists=True, file_okay=False, dir_okay=True), required=False
)
@click.option("--host", help="Server host")
@click.option("--port", type=int, help="Server port")
@click.option("--show-hidden/--no-show-hidden", default=None, help="Show hidden files/directories")
def serve(repo_path: str | None, host: str | None, port: int | None, show_hidden: bool | None):
    """Start the Vantage development server (default command)."""
    # Set environment variables only if arguments are provided
    if repo_path:
        os.environ["TARGET_REPO"] = str(Path(repo_path).resolve())
    if host:
        os.environ["HOST"] = host
    if port:
        os.environ["PORT"] = str(port)
    if show_hidden is not None:
        os.environ["SHOW_HIDDEN"] = str(show_hidden).lower()

    # Re-import and re-instantiate settings to pick up new environment variables
    import importlib

    from vantage import settings

    importlib.reload(settings)

    final_settings = settings.get_settings()

    _warn_nonlocal(final_settings.host)
    uvicorn.run("vantage.main:app", host=final_settings.host, port=final_settings.port, reload=True)


@cli.command()
@click.option(
    "--config",
    "-c",
    type=click.Path(dir_okay=False),
    default=None,
    help=f"Path to config file (default: {DEFAULT_CONFIG_PATH})",
)
@click.option(
    "--host",
    multiple=True,
    help="Override server host from config (can be specified multiple times)",
)
@click.option("--port", type=int, help="Override server port from config")
def daemon(config: str | None, host: list[str] | None, port: int | None):
    """Start Vantage daemon to serve multiple directories.

    This command reads from a TOML configuration file that specifies
    multiple directories to serve. Each directory appears as a top-level
    item in the sidebar.

    Example config (~/.config/vantage/config.toml):

    \b
        host = "127.0.0.1"
        port = 8000

    \b
        [[repos]]
        name = "notes"
        path = "~/Documents/notes"

    \b
        [[repos]]
        name = "work"
        path = "~/work/docs"
    """
    config_path = Path(config) if config else DEFAULT_CONFIG_PATH

    if not config_path.exists():
        click.echo(f"Config file not found: {config_path}", err=True)
        click.echo("Create one with: vantage init-config", err=True)
        sys.exit(1)

    try:
        daemon_cfg = DaemonConfig.from_file(config_path)
    except Exception as e:
        click.echo(f"Error loading config: {e}", err=True)
        sys.exit(1)

    # Apply command-line overrides
    if host:
        daemon_cfg.host = list(host) if len(host) > 1 else host[0]
    if port:
        daemon_cfg.port = port

    # Validate configuration
    errors = daemon_cfg.validate()
    if errors:
        click.echo("Configuration errors:", err=True)
        for error in errors:
            click.echo(f"  - {error}", err=True)
        sys.exit(1)

    # Set daemon config in settings module before starting
    from vantage import settings as settings_module

    settings_module.set_daemon_config(daemon_cfg)

    _warn_nonlocal(daemon_cfg.host)
    click.echo(f"Starting Vantage daemon on {daemon_cfg.host}:{daemon_cfg.port}")
    click.echo(f"Serving {len(daemon_cfg.repos)} repositories:")
    for repo in daemon_cfg.repos:
        click.echo(f"  - {repo.name}: {repo.path}")

    hosts = [daemon_cfg.host] if isinstance(daemon_cfg.host, str) else daemon_cfg.host

    if len(hosts) == 1:
        uvicorn.run(
            "vantage.main:app",
            host=hosts[0],
            port=daemon_cfg.port,
            reload=False,
        )
    else:
        import threading

        threads = []

        def run_server(h):
            uvicorn.run(
                "vantage.main:app",
                host=h,
                port=daemon_cfg.port,
                reload=False,
                log_level="info",
            )

        for h in hosts[:-1]:
            t = threading.Thread(target=run_server, args=(h,), daemon=True)
            t.start()
            threads.append(t)

        # Run the last one in the main thread
        run_server(hosts[-1])


@cli.command("init-config")
@click.option(
    "--path",
    "-p",
    type=click.Path(dir_okay=False),
    default=None,
    help=f"Path for config file (default: {DEFAULT_CONFIG_PATH})",
)
@click.option("--force", "-f", is_flag=True, help="Overwrite existing config file")
def init_config(path: str | None, force: bool):
    """Create an example configuration file for daemon mode."""
    config_path = Path(path) if path else DEFAULT_CONFIG_PATH

    if config_path.exists() and not force:
        click.echo(f"Config file already exists: {config_path}", err=True)
        click.echo("Use --force to overwrite", err=True)
        sys.exit(1)

    created_path = create_example_config(config_path)
    click.echo(f"Created example config: {created_path}")
    click.echo("\nEdit this file to configure your repositories, then run:")
    click.echo("  vantage daemon")


@cli.command("install-service")
@click.option("--user", is_flag=True, default=True, help="Install as user service (default)")
def install_service(user: bool):  # noqa: ARG001
    """Install Vantage as a systemd user service."""
    import shutil
    import subprocess

    service_dir = Path("~/.config/systemd/user").expanduser()
    service_dir.mkdir(parents=True, exist_ok=True)
    service_file = service_dir / "vantage.service"

    # Find the vantage executable
    vantage_path = shutil.which("vantage")
    if not vantage_path:
        # Try to find it via uv
        try:
            result = subprocess.run(
                ["uv", "tool", "run", "--from", "vantage", "which", "vantage"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                vantage_path = result.stdout.strip()
        except FileNotFoundError:
            pass

    if not vantage_path:
        click.echo("Could not find vantage executable.", err=True)
        click.echo("Install it first with: uv tool install vantage", err=True)
        sys.exit(1)

    service_content = f"""\
[Unit]
Description=Vantage Markdown Viewer Daemon
After=network.target

[Service]
Type=simple
ExecStart={vantage_path} daemon
Restart=on-failure
RestartSec=5

# Optional: Increase file descriptor limits for watching many files
# LimitNOFILE=65536

[Install]
WantedBy=default.target
"""

    with open(service_file, "w") as f:
        f.write(service_content)

    click.echo(f"Created systemd service: {service_file}")
    click.echo("\nTo enable and start the service:")
    click.echo("  systemctl --user daemon-reload")
    click.echo("  systemctl --user enable vantage")
    click.echo("  systemctl --user start vantage")
    click.echo("\nTo check status:")
    click.echo("  systemctl --user status vantage")
    click.echo("  journalctl --user -u vantage -f")


@cli.command()
@click.argument("repo_path", type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option(
    "--output",
    "-o",
    type=click.Path(file_okay=False, dir_okay=True),
    default="./vantage-static",
    help="Output directory for the static site",
)
@click.option(
    "--frontend-dist",
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    help="Path to pre-built frontend dist directory (optional)",
)
@click.option(
    "--name",
    "-n",
    type=str,
    default=None,
    help="Name for the repository (defaults to directory name)",
)
@click.option(
    "--base-path",
    type=str,
    default="/",
    help="Base URL path for the deployed site (e.g. /docs/ if hosted at example.com/docs/)",
)
def build(repo_path: str, output: str, frontend_dist: str | None, name: str | None, base_path: str):
    """Build a static site from a markdown repository.

    This generates a fully self-contained static site with pre-rendered
    API data that can be served by any static file server — Cloudflare
    Pages, GitHub Pages, nginx, or even Python's built-in server.

    All Markdown content, git history, diffs, and file metadata are
    pre-generated as JSON files. The frontend detects static mode
    automatically and reads from these files instead of a live API.
    """
    from vantage.services.static_builder import build_static_site

    source = Path(repo_path).resolve()
    output_path = Path(output).resolve()
    frontend_path = Path(frontend_dist).resolve() if frontend_dist else None

    build_static_site(source, output_path, frontend_path, repo_name=name, base_path=base_path)

    click.echo("\nStatic site built successfully!")
    click.echo(f"Output: {output_path}")
    click.echo("\nTo preview locally:")
    click.echo(f"  cd {output_path} && python -m http.server 8080")
    click.echo("\nTo deploy to Cloudflare Pages:")
    click.echo(f"  npx wrangler pages deploy {output_path}")


def main():
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
