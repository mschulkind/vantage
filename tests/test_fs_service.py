import pytest

from vantage.services.fs_service import FileSystemService


@pytest.fixture
def temp_repo(tmp_path):
    # Create a dummy repo structure
    (tmp_path / "file1.md").write_text("content1")
    (tmp_path / "subdir").mkdir()
    (tmp_path / "subdir" / "file2.md").write_text("content2")
    return tmp_path


def test_list_directory(temp_repo):
    fs = FileSystemService(temp_repo)
    nodes = fs.list_directory(".")
    assert len(nodes) == 2
    assert any(n.name == "file1.md" and not n.is_dir for n in nodes)
    assert any(n.name == "subdir" and n.is_dir for n in nodes)


def test_read_file(temp_repo):
    fs = FileSystemService(temp_repo)
    content = fs.read_file("file1.md")
    assert content.content == "content1"
    assert content.path == "file1.md"


def test_validate_path_traversal(temp_repo):
    fs = FileSystemService(temp_repo)
    with pytest.raises(ValueError, match="Path traversal detected"):
        fs.validate_path("../outside.txt")


def test_validate_path_absolute(temp_repo):
    fs = FileSystemService(temp_repo)
    with pytest.raises(ValueError, match="Absolute paths not allowed"):
        fs.validate_path("/etc/passwd")


def test_validate_path_null_byte(temp_repo):
    fs = FileSystemService(temp_repo)
    with pytest.raises(ValueError, match="Invalid path"):
        fs.validate_path("file\x00.md")


def test_validate_path_double_dot_in_middle(temp_repo):
    fs = FileSystemService(temp_repo)
    with pytest.raises(ValueError, match="Path traversal detected"):
        fs.validate_path("subdir/../../etc/passwd")


def test_validate_path_empty(temp_repo):
    fs = FileSystemService(temp_repo)
    with pytest.raises(ValueError, match="Invalid path"):
        fs.validate_path("")


def test_validate_path_allows_symlink_target_within_allowed_read_roots(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    allowed_root = tmp_path / "allowed"
    allowed_root.mkdir()
    (allowed_root / "allowed.md").write_text("allowed content")
    (repo_root / "link.md").symlink_to(allowed_root / "allowed.md")

    fs = FileSystemService(repo_root, allowed_read_roots=[allowed_root])
    result = fs.validate_path("link.md")
    assert result == (allowed_root / "allowed.md").resolve()
    assert fs.read_file("link.md").content == "allowed content"


def test_validate_path_rejects_symlink_target_outside_allowed_read_roots(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    allowed_root = tmp_path / "allowed"
    allowed_root.mkdir()
    blocked_root = tmp_path / "blocked"
    blocked_root.mkdir()
    (blocked_root / "blocked.md").write_text("blocked content")
    (repo_root / "link.md").symlink_to(blocked_root / "blocked.md")

    fs = FileSystemService(repo_root, allowed_read_roots=[allowed_root])
    with pytest.raises(ValueError, match="Path traversal detected"):
        fs.validate_path("link.md")


def test_list_directory_has_markdown(tmp_path):
    """Directories without .md files should appear with has_markdown=False."""
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "readme.md").write_text("hello")
    (tmp_path / "empty_dir").mkdir()
    (tmp_path / "empty_dir" / "data.txt").write_text("nope")
    (tmp_path / "nested").mkdir()
    (tmp_path / "nested" / "deep").mkdir()
    (tmp_path / "nested" / "deep" / "found.md").write_text("yes")

    fs = FileSystemService(tmp_path)
    nodes = fs.list_directory(".")
    by_name = {n.name: n for n in nodes}

    assert by_name["docs"].has_markdown is True
    # empty_dir has no markdown — still listed but flagged
    assert by_name["empty_dir"].has_markdown is False
    assert by_name["nested"].has_markdown is True


def test_list_directory_hidden_markdown(tmp_path):
    """Hidden directories with .md files and hidden .md files should be shown."""
    (tmp_path / ".hidden_dir").mkdir()
    (tmp_path / ".hidden_dir" / "notes.md").write_text("secret notes")
    (tmp_path / ".hidden.md").write_text("hidden markdown")
    (tmp_path / ".no_md_dir").mkdir()
    (tmp_path / ".no_md_dir" / "data.txt").write_text("nope")

    fs = FileSystemService(tmp_path)
    nodes = fs.list_directory(".")
    by_name = {n.name: n for n in nodes}

    assert ".hidden_dir" in by_name
    assert by_name[".hidden_dir"].is_dir is True
    assert ".hidden.md" in by_name
    assert by_name[".hidden.md"].is_dir is False
    # .no_md_dir has no markdown — still listed but flagged
    assert ".no_md_dir" in by_name
    assert by_name[".no_md_dir"].has_markdown is False


# --- Symlink tests ---


def test_list_directory_internal_file_symlink(tmp_path):
    """Symlinks to files inside the project are shown with is_symlink and target."""
    (tmp_path / "real.md").write_text("real content")
    (tmp_path / "link.md").symlink_to(tmp_path / "real.md")

    fs = FileSystemService(tmp_path)
    nodes = fs.list_directory(".")
    by_name = {n.name: n for n in nodes}

    assert "real.md" in by_name
    assert by_name["real.md"].is_symlink is False

    assert "link.md" in by_name
    assert by_name["link.md"].is_symlink is True
    assert by_name["link.md"].symlink_target == "real.md"


def test_list_directory_internal_dir_symlink(tmp_path):
    """Symlinks to directories inside the project are shown with is_symlink and target."""
    (tmp_path / "real_dir").mkdir()
    (tmp_path / "real_dir" / "doc.md").write_text("hello")
    (tmp_path / "link_dir").symlink_to(tmp_path / "real_dir")

    fs = FileSystemService(tmp_path)
    nodes = fs.list_directory(".")
    by_name = {n.name: n for n in nodes}

    assert "real_dir" in by_name
    assert by_name["real_dir"].is_symlink is False

    assert "link_dir" in by_name
    assert by_name["link_dir"].is_symlink is True
    assert by_name["link_dir"].symlink_target == "real_dir"
    assert by_name["link_dir"].is_dir is True


def test_list_directory_external_symlink_file(tmp_path):
    """Symlinks to files outside the project are shown as errors."""
    repo = tmp_path / "repo"
    repo.mkdir()
    external = tmp_path / "external"
    external.mkdir()
    (external / "secret.md").write_text("secret")
    (repo / "link.md").symlink_to(external / "secret.md")

    fs = FileSystemService(repo)
    nodes = fs.list_directory(".")
    by_name = {n.name: n for n in nodes}

    assert "link.md" in by_name
    assert by_name["link.md"].is_symlink is True
    assert by_name["link.md"].symlink_target is None  # error state


def test_list_directory_external_symlink_dir(tmp_path):
    """Symlinks to directories outside the project are shown as errors."""
    repo = tmp_path / "repo"
    repo.mkdir()
    external = tmp_path / "external"
    external.mkdir()
    (repo / "link_dir").symlink_to(external)

    fs = FileSystemService(repo)
    nodes = fs.list_directory(".")
    by_name = {n.name: n for n in nodes}

    assert "link_dir" in by_name
    assert by_name["link_dir"].is_symlink is True
    assert by_name["link_dir"].symlink_target is None
    assert by_name["link_dir"].has_markdown is False


def test_list_directory_broken_symlink(tmp_path):
    """Broken symlinks are shown as errors."""
    (tmp_path / "broken.md").symlink_to(tmp_path / "nonexistent.md")

    fs = FileSystemService(tmp_path)
    nodes = fs.list_directory(".")
    by_name = {n.name: n for n in nodes}

    assert "broken.md" in by_name
    assert by_name["broken.md"].is_symlink is True
    assert by_name["broken.md"].symlink_target is None


def test_list_all_files_skips_symlinks(tmp_path):
    """list_all_files should not return symlinked files."""
    (tmp_path / "real.md").write_text("real content")
    (tmp_path / "link.md").symlink_to(tmp_path / "real.md")

    fs = FileSystemService(tmp_path)
    files = fs.list_all_files()

    assert "real.md" in files
    assert "link.md" not in files
