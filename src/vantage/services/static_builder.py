"""Static site builder for Vantage.

Generates a fully self-contained static site from a markdown repository.
All API endpoints are pre-rendered as JSON files so the frontend works
without a backend — perfect for Cloudflare Pages, GitHub Pages, or any
static hosting.
"""

import json
import shutil
import subprocess
from pathlib import Path

from vantage.services.fs_service import FileSystemService
from vantage.services.git_service import GitService


class StaticSiteBuilder:
    """Builds a static site from markdown files with pre-rendered API data."""

    def __init__(
        self,
        source_path: Path,
        output_path: Path,
        frontend_dist: Path | None = None,
        repo_name: str | None = None,
        base_path: str = "/",
    ):
        """Initialize the static site builder.

        Args:
            source_path: Path to the source repository with markdown files.
            output_path: Path where the static site will be generated.
            frontend_dist: Optional path to pre-built frontend dist.
            repo_name: Optional name for the repo (defaults to directory name).
            base_path: Base URL path for deployment (e.g. '/docs/').
        """
        self.source_path = source_path.resolve()
        self.output_path = output_path.resolve()
        self.frontend_dist = frontend_dist
        self.repo_name = repo_name or self.source_path.name
        # Ensure base_path has leading and trailing slashes
        self.base_path = base_path if base_path.startswith("/") else f"/{base_path}"
        if not self.base_path.endswith("/"):
            self.base_path += "/"
        self.fs_service = FileSystemService(source_path)
        self.git_service = GitService(source_path)

    def build(self) -> None:
        """Build the static site."""
        print(f"Building static site from {self.source_path}")
        print(f"Output directory: {self.output_path}")

        # Create output directory
        self.output_path.mkdir(parents=True, exist_ok=True)

        # Build or copy frontend
        self._copy_frontend()

        # Generate all static API data
        self._generate_api_data()

        # Inject static mode flag into index.html
        self._inject_static_mode()

        # Generate SPA fallback for Cloudflare Pages
        self._generate_spa_config()

        print("Static site build complete!")

    def _copy_frontend(self) -> None:
        """Copy or build the frontend assets."""
        frontend_src = self.frontend_dist
        if frontend_src is None:
            # Try to find and build frontend
            frontend_dir = Path(__file__).parent.parent.parent.parent.parent / "frontend"
            if not frontend_dir.exists():
                raise ValueError(f"Frontend directory not found: {frontend_dir}")

            print("Building frontend...")
            subprocess.run(["npm", "install"], cwd=frontend_dir, check=True)
            subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True)
            frontend_src = frontend_dir / "dist"

        if not frontend_src.exists():
            raise ValueError(f"Frontend dist not found: {frontend_src}")

        print(f"Copying frontend from {frontend_src}")

        # Copy all frontend files
        for item in frontend_src.iterdir():
            dest = self.output_path / item.name
            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)

    def _generate_api_data(self) -> None:
        """Generate all static JSON files that replicate the API."""
        api_dir = self.output_path / "api"
        api_dir.mkdir(exist_ok=True)

        print("Generating static API data...")

        # 1. Static mode sentinel
        static_info = {
            "static": True,
            "repo_name": self.repo_name,
            "generated_by": "vantage-static-builder",
        }
        self._write_json(api_dir / "static.json", static_info)

        # 2. Repos list (single-repo mode)
        self._write_json(api_dir / "repos.json", [{"name": ""}])

        # 3. Repo info
        self._write_json(api_dir / "info.json", {"name": self.repo_name})

        # 4. Health check
        self._write_json(api_dir / "health.json", {"status": "ok"})

        # 5. All files list
        all_files = self.fs_service.list_all_files()
        self._write_json(api_dir / "files.json", all_files)

        # 6. Tree data for every directory
        self._generate_tree_data(api_dir)

        # 7. Content + git data for every markdown file
        self._generate_content_and_git_data(api_dir, all_files)

        # 8. Recent files
        recent = self.git_service.get_recently_changed_files(limit=30)
        self._write_json(api_dir / "git" / "recent.json", recent)

    def _generate_tree_data(self, api_dir: Path) -> None:
        """Generate tree JSON for root and every subdirectory."""
        tree_dir = api_dir / "tree"
        tree_dir.mkdir(parents=True, exist_ok=True)

        # Process root and all subdirectories recursively
        self._process_tree_dir(".", tree_dir)

    def _process_tree_dir(self, rel_path: str, tree_dir: Path) -> None:
        """Process a single directory for tree data."""
        try:
            nodes = self.fs_service.list_directory(rel_path, include_git=True)
        except Exception as e:
            print(f"Warning: Could not list directory {rel_path}: {e}")
            return

        tree_data = [node.model_dump(mode="json") for node in nodes]

        # Write tree file
        if rel_path == ".":
            self._write_json(tree_dir / "_.json", tree_data)
        else:
            # Create subdirectories as needed: tree/docs/design.json
            tree_file = tree_dir / f"{rel_path}.json"
            tree_file.parent.mkdir(parents=True, exist_ok=True)
            self._write_json(tree_file, tree_data)

        # Recurse into subdirectories
        for node in nodes:
            if node.is_dir:
                self._process_tree_dir(node.path, tree_dir)

    def _generate_content_and_git_data(self, api_dir: Path, all_files: list[str]) -> None:
        """Generate content JSON and git data for every markdown file."""
        content_dir = api_dir / "content"
        history_dir = api_dir / "git" / "history"
        status_dir = api_dir / "git" / "status"
        diff_dir = api_dir / "git" / "diff"

        for d in [content_dir, history_dir, status_dir, diff_dir]:
            d.mkdir(parents=True, exist_ok=True)

        for file_path in all_files:
            # Content
            try:
                content = self.fs_service.read_file(file_path)
                out_file = content_dir / f"{file_path}.json"
                out_file.parent.mkdir(parents=True, exist_ok=True)
                self._write_json(out_file, content.model_dump(mode="json"))
            except Exception as e:
                print(f"Warning: Could not process content for {file_path}: {e}")
                continue

            # Git history
            history = self.git_service.get_history(file_path, limit=20)
            history_data = [c.model_dump(mode="json") for c in history]
            hist_file = history_dir / f"{file_path}.json"
            hist_file.parent.mkdir(parents=True, exist_ok=True)
            self._write_json(hist_file, history_data)

            # Git status (latest commit)
            latest = self.git_service.get_last_commit(file_path)
            status_file = status_dir / f"{file_path}.json"
            status_file.parent.mkdir(parents=True, exist_ok=True)
            if latest:
                self._write_json(status_file, latest.model_dump(mode="json"))
            else:
                self._write_json(status_file, None)

            # Git diffs for each commit
            for commit in history:
                try:
                    diff = self.git_service.get_file_diff(file_path, commit.hexsha)
                    diff_file = diff_dir / file_path / f"{commit.hexsha}.json"
                    diff_file.parent.mkdir(parents=True, exist_ok=True)
                    if diff:
                        self._write_json(diff_file, diff.model_dump(mode="json"))
                    else:
                        # Write null so static mode gets a 200 instead of a 404
                        self._write_json(diff_file, None)
                except Exception as e:
                    print(f"Warning: Could not generate diff for {file_path}@{commit.hexsha}: {e}")

    def _inject_static_mode(self) -> None:
        """Inject static mode flag and rewrite asset paths for the deploy base path."""
        import re

        index_html = self.output_path / "index.html"
        if not index_html.exists():
            return

        content = index_html.read_text()

        # Inject static mode script tag
        static_script = f'<script>window.__VANTAGE_STATIC__=true;window.__VANTAGE_BASE_PATH__="{self.base_path}";</script>'
        if "window.__VANTAGE_STATIC__" not in content:
            content = content.replace("<head>", f"<head>\n    {static_script}")

        # Rewrite root-relative asset paths to use the correct base path.
        # Vite builds with base="/" by default, producing paths like:
        #   /assets/index-xxx.js  and  /assets/index-xxx.css
        # When deployed under a subpath (e.g. /docs/), these need to become:
        #   /docs/assets/index-xxx.js  etc.
        if self.base_path != "/":
            # Rewrite href="/assets/..." and src="/assets/..."
            content = re.sub(
                r'(href|src)="/assets/',
                f'\\1="{self.base_path}assets/',
                content,
            )

        # Remove any existing <base href> tag — asset paths are now absolute
        content = re.sub(r'\s*<base href="[^"]*"\s*/?>', "", content)

        index_html.write_text(content)

    def _generate_spa_config(self) -> None:
        """Generate Cloudflare Pages SPA routing config."""
        # _redirects for SPA fallback — but api/* must NOT be redirected
        # Cloudflare Pages serves static files first, then applies _redirects
        # So /api/tree/_.json will be served as-is, and /docs/foo.md hits the SPA
        redirects = "/*  /index.html  200\n"
        (self.output_path / "_redirects").write_text(redirects)

        # _headers for security and caching
        headers = """/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/api/*
  Cache-Control: public, max-age=3600

/assets/*
  Cache-Control: public, max-age=31536000, immutable
"""
        (self.output_path / "_headers").write_text(headers)

    @staticmethod
    def _write_json(path: Path, data: object) -> None:
        """Write data as JSON to a file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, default=str))


def build_static_site(
    source: Path,
    output: Path,
    frontend_dist: Path | None = None,
    repo_name: str | None = None,
    base_path: str = "/",
) -> None:
    """Build a static site from a markdown repository.

    Args:
        source: Path to the source repository.
        output: Path to the output directory.
        frontend_dist: Optional path to pre-built frontend dist.
        repo_name: Optional name for the repo.
        base_path: Base URL path for deployment (e.g. '/docs/').
    """
    builder = StaticSiteBuilder(source, output, frontend_dist, repo_name, base_path=base_path)
    builder.build()
