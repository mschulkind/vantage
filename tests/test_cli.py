"""CLI integration tests.

Focus: verify every click command in the `vantage` CLI group can actually be
invoked without a ``TypeError`` from a parameter-name mismatch between click
options and the callback signature.

Click derives kwarg names from option flags (``--base-path`` → ``base_path``)
and calls the callback as ``callback(**ctx.params)``. If the function signature
uses a different name (e.g. ``_base_path`` to silence an unused-arg linter),
every invocation of that command crashes. A ``--help`` smoke test does NOT
catch this, because click exits before invoking the callback.
"""

from __future__ import annotations

import inspect
import sys

import click
import pytest
from click.testing import CliRunner

from vantage.cli import cli


def _all_commands() -> list[tuple[str, click.Command]]:
    """Return every (name, command) pair in the top-level cli group."""
    assert isinstance(cli, click.Group)
    return sorted(cli.commands.items())


@pytest.mark.parametrize(
    ("name", "command"), _all_commands(), ids=lambda v: v if isinstance(v, str) else ""
)
def test_command_signature_matches_click_params(name: str, command: click.Command):
    """Every click param must be accepted by the callback under its exact name.

    This catches the bug where someone renames a param to ``_foo`` to silence
    an unused-argument lint — click still calls ``callback(foo=...)`` and the
    command raises ``TypeError: got an unexpected keyword argument 'foo'``.
    """
    callback = command.callback
    assert callback is not None, f"{name}: command has no callback"

    sig = inspect.signature(callback)
    accepts_kwargs = any(p.kind is inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())

    for param in command.params:
        kwarg = param.name
        assert kwarg is not None, f"{name}: click param has no name"
        if accepts_kwargs:
            continue
        assert kwarg in sig.parameters, (
            f"{name}: click passes kwarg {kwarg!r} (from {param.opts!r}) "
            f"but callback signature has {list(sig.parameters)!r}. "
            f"Did you rename {kwarg!r} to silence an unused-arg warning?"
        )


@pytest.mark.parametrize(
    ("name", "_command"), _all_commands(), ids=lambda v: v if isinstance(v, str) else ""
)
def test_command_help_renders(name: str, _command: click.Command):
    """Every command's --help must render without crashing."""
    result = CliRunner().invoke(cli, [name, "--help"])
    assert result.exit_code == 0, f"{name} --help failed: {result.output}"


def test_build_command_actually_runs(tmp_path):
    """End-to-end invocation of `vantage build` with every option set.

    This is the specific regression test for the ``_base_path`` bug. Unlike
    the signature check above, it exercises click's actual callback dispatch
    with the ``--base-path`` flag set, which is how the original bug surfaced
    in production.
    """
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "README.md").write_text("# hello\n")
    output = tmp_path / "out"

    result = CliRunner().invoke(
        cli,
        [
            "build",
            str(repo),
            "-o",
            str(output),
            "--name",
            "test-repo",
            "--base-path",
            "/docs/",
        ],
    )

    assert result.exit_code == 0, (
        f"build failed (exit={result.exit_code}):\n"
        f"output: {result.output}\n"
        f"exception: {result.exception!r}"
    )
    assert output.exists(), "build command did not create output directory"


@pytest.mark.skipif(sys.platform != "linux", reason="install-service is Linux/systemd-specific")
def test_install_service_command_actually_runs(tmp_path, monkeypatch):
    """End-to-end invocation of `vantage install-service` with ``--user``.

    Regression test for the ``_user`` rename — the same class of bug as
    ``_base_path``. Redirects HOME so the test does not touch the real
    systemd user config directory.
    """
    monkeypatch.setenv("HOME", str(tmp_path))

    result = CliRunner().invoke(cli, ["install-service", "--user"])

    assert result.exit_code == 0, (
        f"install-service failed (exit={result.exit_code}):\n"
        f"output: {result.output}\n"
        f"exception: {result.exception!r}"
    )
    service_file = tmp_path / ".config" / "systemd" / "user" / "vantage.service"
    assert service_file.exists(), "install-service did not write service file"


@pytest.mark.skipif(sys.platform == "linux", reason="tests the non-Linux platform gate")
def test_install_service_rejects_non_linux():
    """On macOS/Windows, `install-service` must exit non-zero with a clear message."""
    result = CliRunner().invoke(cli, ["install-service", "--user"])

    assert result.exit_code != 0, "install-service should fail on non-Linux platforms"
    assert "Linux" in result.output, (
        f"expected a platform-specific error mentioning Linux, got: {result.output!r}"
    )
