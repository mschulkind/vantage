"""Tests for the static site builder."""

import json
import tempfile
from pathlib import Path

import pytest

from vantage.services.static_builder import StaticSiteBuilder


class TestStaticSiteBuilder:
    """Tests for the StaticSiteBuilder class."""

    @pytest.fixture
    def temp_source(self):
        """Create a temporary source directory with test files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir)

            # Create some test files
            (source / "README.md").write_text("# Test README\n\nSome content.")
            (source / "docs").mkdir()
            (source / "docs" / "guide.md").write_text("# Guide\n\nA guide.")

            yield source

    @pytest.fixture
    def temp_output(self):
        """Create a temporary output directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)

    @pytest.fixture
    def mock_frontend_dist(self):
        """Create a mock frontend dist directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            dist = Path(tmpdir)

            # Create mock frontend files
            (dist / "index.html").write_text("<html><head></head><body>App</body></html>")
            (dist / "assets").mkdir()
            (dist / "assets" / "main.js").write_text("console.log('app');")

            yield dist

    def test_builder_creates_output_directory(self, temp_source, temp_output, mock_frontend_dist):
        """Test that the builder creates the output directory."""
        output = temp_output / "new_dir"
        builder = StaticSiteBuilder(temp_source, output, mock_frontend_dist)
        builder.build()

        assert output.exists()
        assert output.is_dir()

    def test_builder_copies_frontend_files(self, temp_source, temp_output, mock_frontend_dist):
        """Test that frontend files are copied."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        assert (temp_output / "index.html").exists()
        assert (temp_output / "assets" / "main.js").exists()

    def test_builder_generates_tree_data(self, temp_source, temp_output, mock_frontend_dist):
        """Test that tree JSON files are generated for all directories."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        # Root tree
        tree_file = temp_output / "api" / "tree" / "_.json"
        assert tree_file.exists()

        tree_data = json.loads(tree_file.read_text())
        assert isinstance(tree_data, list)

        # Should contain README.md and docs directory
        names = [item["name"] for item in tree_data]
        assert "README.md" in names
        assert "docs" in names

        # Subdirectory tree
        docs_tree = temp_output / "api" / "tree" / "docs.json"
        assert docs_tree.exists()

        docs_data = json.loads(docs_tree.read_text())
        doc_names = [item["name"] for item in docs_data]
        assert "guide.md" in doc_names

    def test_builder_generates_content_files(self, temp_source, temp_output, mock_frontend_dist):
        """Test that content JSON files are generated for markdown files."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        # Check README.md content file
        readme_content = temp_output / "api" / "content" / "README.md.json"
        assert readme_content.exists()

        content_data = json.loads(readme_content.read_text())
        assert "content" in content_data
        assert "Test README" in content_data["content"]

    def test_builder_generates_subdirectory_content(
        self, temp_source, temp_output, mock_frontend_dist
    ):
        """Test that content files are generated for nested directories."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        # Check docs/guide.md content file (proper path structure)
        guide_content = temp_output / "api" / "content" / "docs" / "guide.md.json"
        assert guide_content.exists()

        content_data = json.loads(guide_content.read_text())
        assert "Guide" in content_data["content"]

    def test_builder_generates_static_sentinel(self, temp_source, temp_output, mock_frontend_dist):
        """Test that the static mode sentinel file is generated."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        static_file = temp_output / "api" / "static.json"
        assert static_file.exists()

        data = json.loads(static_file.read_text())
        assert data["static"] is True
        assert data["generated_by"] == "vantage-static-builder"

    def test_builder_generates_repos_json(self, temp_source, temp_output, mock_frontend_dist):
        """Test that repos.json is generated for single-repo mode."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        repos_file = temp_output / "api" / "repos.json"
        assert repos_file.exists()

        data = json.loads(repos_file.read_text())
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["name"] == ""

    def test_builder_generates_files_list(self, temp_source, temp_output, mock_frontend_dist):
        """Test that files.json contains all markdown files."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        files_file = temp_output / "api" / "files.json"
        assert files_file.exists()

        data = json.loads(files_file.read_text())
        assert isinstance(data, list)
        assert "README.md" in data
        assert "docs/guide.md" in data

    def test_builder_generates_info_json(self, temp_source, temp_output, mock_frontend_dist):
        """Test that info.json contains the repo name."""
        builder = StaticSiteBuilder(
            temp_source, temp_output, mock_frontend_dist, repo_name="test-repo"
        )
        builder.build()

        info_file = temp_output / "api" / "info.json"
        assert info_file.exists()

        data = json.loads(info_file.read_text())
        assert data["name"] == "test-repo"

    def test_builder_generates_git_history(self, temp_source, temp_output, mock_frontend_dist):
        """Test that git history files are generated (empty for non-git dirs)."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        # History file should exist even if empty (no git repo)
        history_file = temp_output / "api" / "git" / "history" / "README.md.json"
        assert history_file.exists()

        data = json.loads(history_file.read_text())
        assert isinstance(data, list)

    def test_builder_generates_recent_files(self, temp_source, temp_output, mock_frontend_dist):
        """Test that recent files JSON is generated."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        recent_file = temp_output / "api" / "git" / "recent.json"
        assert recent_file.exists()

        data = json.loads(recent_file.read_text())
        assert isinstance(data, list)

    def test_builder_injects_static_mode(self, temp_source, temp_output, mock_frontend_dist):
        """Test that static mode flag is injected into index.html."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        content = (temp_output / "index.html").read_text()
        assert "window.__VANTAGE_STATIC__=true" in content

    def test_builder_generates_spa_config(self, temp_source, temp_output, mock_frontend_dist):
        """Test that Cloudflare Pages config files are generated."""
        builder = StaticSiteBuilder(temp_source, temp_output, mock_frontend_dist)
        builder.build()

        assert (temp_output / "_redirects").exists()
        assert (temp_output / "_headers").exists()

        redirects = (temp_output / "_redirects").read_text()
        assert "/index.html" in redirects

    def test_builder_custom_repo_name(self, temp_source, temp_output, mock_frontend_dist):
        """Test that custom repo name is used."""
        builder = StaticSiteBuilder(
            temp_source, temp_output, mock_frontend_dist, repo_name="my-docs"
        )
        builder.build()

        info = json.loads((temp_output / "api" / "info.json").read_text())
        assert info["name"] == "my-docs"

        static = json.loads((temp_output / "api" / "static.json").read_text())
        assert static["repo_name"] == "my-docs"
