"""Service for interacting with jj (Jujutsu) version control."""

import contextlib
import logging
import subprocess
from datetime import datetime
from pathlib import Path

from vantage.schemas.models import (
    DiffHunk,
    DiffLine,
    FileDiff,
    JJEvoEntry,
    JJInfo,
    JJRevision,
)
from vantage.services.perf import timed

logger = logging.getLogger(__name__)

# Separator unlikely to appear in normal jj output
_SEP = "␞"  # Unicode Record Separator character


class JJService:
    """Wraps jj CLI commands for a given repository."""

    def __init__(self, repo_path: Path) -> None:
        self.repo_path = repo_path
        self._is_jj: bool | None = None

    @property
    def is_jj(self) -> bool:
        if self._is_jj is None:
            # Walk up from repo_path to find .jj/ (mirrors jj CLI behaviour)
            p = self.repo_path.resolve()
            while True:
                if (p / ".jj").is_dir():
                    self._is_jj = True
                    break
                parent = p.parent
                if parent == p:
                    # Reached filesystem root without finding .jj
                    self._is_jj = False
                    break
                p = parent
        return self._is_jj

    def get_info(self) -> JJInfo:
        """Get jj status info for this repo."""
        if not self.is_jj:
            return JJInfo(is_jj=False)

        change_id = self._run_jj(
            ["log", "-r", "@", "--no-graph", "--limit", "1", "-T", "change_id.shortest()"],
        )
        return JJInfo(
            is_jj=True,
            working_copy_change_id=change_id.strip() if change_id else None,
        )

    @timed("jj", "get_log")
    def get_log(self, path: str | None = None, limit: int = 50) -> list[JJRevision]:
        """Get jj revision log, optionally for a specific file."""
        if not self.is_jj:
            return []

        sep_expr = f' ++ "{_SEP}" ++ '
        template = (
            sep_expr.join(
                [
                    "change_id.shortest()",
                    "commit_id.short(12)",
                    "description.first_line()",
                    "author.name()",
                    "author.timestamp().utc()",
                    'bookmarks.map(|b| b.name()).join(",")',
                    'if(self.current_working_copy(), "true", "false")',
                ]
            )
            + ' ++ "\\n"'
        )

        args = ["log", "--no-graph", "--limit", str(limit), "-T", template]
        if path:
            args.extend(["--", path])

        output = self._run_jj(args)
        if not output:
            return []

        revisions = []
        for line in output.strip().splitlines():
            parts = line.split(_SEP)
            if len(parts) < 7:
                continue
            try:
                ts = self._parse_timestamp(parts[4])
                bookmarks = [b for b in parts[5].split(",") if b]
                revisions.append(
                    JJRevision(
                        change_id=parts[0],
                        commit_id=parts[1],
                        description=parts[2],
                        author=parts[3],
                        timestamp=ts,
                        bookmarks=bookmarks,
                        is_working_copy=parts[6].strip() == "true",
                    )
                )
            except Exception:
                logger.debug("Failed to parse jj log line: %s", line)
                continue

        return revisions

    @timed("jj", "get_evolog")
    def get_evolog(self, rev: str = "@", limit: int = 20) -> list[JJEvoEntry]:
        """Get evolution log for a specific revision."""
        if not self.is_jj:
            return []

        # evolog has a different template type (CommitEvolutionEntry)
        # Use the default output and parse it
        args = ["evolog", "-r", rev, "--no-graph", "--limit", str(limit)]
        output = self._run_jj(args)
        if not output:
            return []

        entries = []
        lines = output.strip().splitlines()
        i = 0
        while i < len(lines):
            # First line: change_id author email date commit_id (hidden?)
            header = lines[i]
            parts = header.split()
            if len(parts) < 4:
                i += 1
                continue

            change_id_part = parts[0]  # e.g., "qnpvpkwm" or "qnpvpkwm/1"
            # Find commit hash (8+ hex chars)
            commit_id = ""
            hidden = "(hidden)" in header
            for p in parts:
                if len(p) >= 8 and all(c in "0123456789abcdef" for c in p):
                    commit_id = p
                    break

            # Find timestamp (YYYY-MM-DD HH:MM:SS)
            ts = datetime.now()
            for j, p in enumerate(parts):
                if len(p) == 10 and p[4:5] == "-" and p[7:8] == "-":
                    try:
                        ts_str = p + " " + parts[j + 1]
                        ts = datetime.fromisoformat(ts_str)
                    except (ValueError, IndexError):
                        pass
                    break

            # Second line: description
            i += 1
            description = ""
            if i < len(lines) and not lines[i].startswith("--"):
                description = lines[i].strip()
                i += 1

            # Third line: operation (starts with "-- operation")
            operation = ""
            if i < len(lines) and lines[i].strip().startswith("-- operation"):
                op_line = lines[i].strip()
                # Extract operation description after the op hash
                op_parts = op_line.split(None, 3)
                operation = op_parts[3] if len(op_parts) > 3 else op_line
                i += 1

            # Find author from header (email is between change_id and date)
            author = ""
            for p in parts:
                if "@" in p and "." in p:
                    author = p
                    break

            entries.append(
                JJEvoEntry(
                    commit_id=commit_id or change_id_part,
                    description=description,
                    author=author,
                    timestamp=ts,
                    operation=operation,
                    hidden=hidden,
                )
            )

        return entries

    @timed("jj", "get_diff")
    def get_diff(
        self,
        rev: str,
        path: str | None = None,
    ) -> FileDiff | None:
        """Get diff for a jj revision, optionally for a specific file."""
        if not self.is_jj:
            return None

        args = ["diff", "-r", rev, "--git"]
        if path:
            args.extend(["--", path])

        output = self._run_jj(args)
        if not output:
            return None

        hunks = self._parse_git_diff(output)
        if not hunks:
            return None

        # Get revision info for the header
        sep_expr = f' ++ "{_SEP}" ++ '
        template = sep_expr.join(
            [
                "change_id.shortest()",
                "description.first_line()",
                "author.name()",
                "author.timestamp().utc()",
            ]
        )
        info = self._run_jj(
            [
                "log",
                "-r",
                rev,
                "--no-graph",
                "--limit",
                "1",
                "-T",
                template,
            ]
        )

        change_id = rev
        message = ""
        author = ""
        ts = datetime.now()
        if info:
            parts = info.strip().split(_SEP)
            if len(parts) >= 4:
                change_id = parts[0]
                message = parts[1]
                author = parts[2]
                with contextlib.suppress(Exception):
                    ts = self._parse_timestamp(parts[3])

        return FileDiff(
            commit_hexsha=change_id,
            commit_message=message,
            commit_author=author,
            commit_date=ts,
            file_path=path or "(all files)",
            hunks=hunks,
            raw_diff=output,
        )

    @timed("jj", "get_interdiff")
    def get_interdiff(self, from_rev: str, to_rev: str, path: str | None = None) -> FileDiff | None:
        """Get diff between two jj revisions."""
        if not self.is_jj:
            return None

        args = ["diff", "--from", from_rev, "--to", to_rev, "--git"]
        if path:
            args.extend(["--", path])

        output = self._run_jj(args)
        if not output:
            return None

        hunks = self._parse_git_diff(output)
        if not hunks:
            return None

        # Get metadata from the to_rev
        sep_expr = f' ++ "{_SEP}" ++ '
        template = sep_expr.join(
            [
                "change_id.shortest()",
                "description.first_line()",
                "author.name()",
                "author.timestamp().utc()",
            ]
        )
        info = self._run_jj(["log", "-r", to_rev, "--no-graph", "--limit", "1", "-T", template])

        change_id = to_rev
        message = f"Changes from {from_rev} to {to_rev}"
        author = ""
        ts = datetime.now()
        if info:
            parts = info.strip().split(_SEP)
            if len(parts) >= 4:
                change_id = parts[0]
                message = parts[1] or f"Snapshot {change_id}"
                author = parts[2]
                with contextlib.suppress(Exception):
                    ts = self._parse_timestamp(parts[3])

        return FileDiff(
            commit_hexsha=f"{from_rev[:8]}..{to_rev[:8]}",
            commit_message=message,
            commit_author=author,
            commit_date=ts,
            file_path=path or "(all files)",
            hunks=hunks,
            raw_diff=output,
        )

    def _run_jj(self, args: list[str], timeout: int = 10) -> str | None:
        """Run a jj command and return stdout."""
        try:
            proc = subprocess.run(
                ["jj", "--no-pager", *args],
                capture_output=True,
                text=True,
                cwd=self.repo_path,
                timeout=timeout,
            )
            if proc.returncode != 0:
                logger.debug("jj %s failed: %s", args[0], proc.stderr.strip())
                return None
            return proc.stdout
        except FileNotFoundError:
            logger.debug("jj not found in PATH")
            self._is_jj = False
            return None
        except subprocess.TimeoutExpired:
            logger.warning("jj %s timed out after %ds", args[0], timeout)
            return None
        except Exception:
            logger.exception("Error running jj %s", args[0])
            return None

    @staticmethod
    def _parse_timestamp(ts_str: str) -> datetime:
        """Parse a jj timestamp string like '2026-02-28 06:34:03.000 +00:00'."""
        ts_str = ts_str.strip()
        # Remove timezone offset for simpler parsing
        if "+" in ts_str or ts_str.endswith("Z"):
            # Strip timezone
            for sep in [" +", " -"]:
                if sep in ts_str[10:]:
                    ts_str = ts_str[: ts_str.rindex(sep)]
                    break
        # Try parsing with/without milliseconds
        for fmt in ["%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"]:
            try:
                return datetime.strptime(ts_str, fmt)
            except ValueError:
                continue
        return datetime.now()

    @staticmethod
    def _parse_git_diff(raw_diff: str) -> list[DiffHunk]:
        """Parse git-format diff output into hunks."""
        import re

        hunks: list[DiffHunk] = []
        current_lines: list[DiffLine] = []
        current_header: str = ""
        old_line_no = 0
        new_line_no = 0

        for line in raw_diff.split("\n"):
            # Skip git diff headers
            if line.startswith("diff --git") or line.startswith("index "):
                continue
            if line.startswith("--- ") or line.startswith("+++ "):
                continue
            if line.startswith("Binary files"):
                continue

            if line.startswith("@@"):
                if current_lines:
                    hunks.append(DiffHunk(header=current_header, lines=current_lines))

                current_header = line
                current_lines = []

                match = re.match(r"@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
                if match:
                    old_line_no = int(match.group(1))
                    new_line_no = int(match.group(2))

                current_lines.append(
                    DiffLine(type="header", content=line, old_line_no=None, new_line_no=None)
                )
            elif current_lines:
                if line.startswith("+"):
                    current_lines.append(
                        DiffLine(
                            type="add", content=line[1:], old_line_no=None, new_line_no=new_line_no
                        )
                    )
                    new_line_no += 1
                elif line.startswith("-"):
                    current_lines.append(
                        DiffLine(
                            type="delete",
                            content=line[1:],
                            old_line_no=old_line_no,
                            new_line_no=None,
                        )
                    )
                    old_line_no += 1
                elif line.startswith(" ") or line == "":
                    current_lines.append(
                        DiffLine(
                            type="context",
                            content=line[1:] if line.startswith(" ") else line,
                            old_line_no=old_line_no,
                            new_line_no=new_line_no,
                        )
                    )
                    old_line_no += 1
                    new_line_no += 1

        if current_lines:
            hunks.append(DiffHunk(header=current_header, lines=current_lines))

        return hunks
