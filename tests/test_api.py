from fastapi.testclient import TestClient

from vantage.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_tree(tmp_path, monkeypatch):
    # Mock settings.target_repo
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    (tmp_path / "test.md").write_text("hello")

    response = client.get("/api/tree")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "test.md"


def test_get_content(tmp_path, monkeypatch):
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    (tmp_path / "test.md").write_text("hello world")

    response = client.get("/api/content?path=test.md")
    assert response.status_code == 200
    assert response.json()["content"] == "hello world"


def test_get_diff_not_found(tmp_path, monkeypatch):
    """Test that requesting a diff for a non-existent commit returns 404."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    response = client.get("/api/git/diff?path=test.md&commit=abc123")
    assert response.status_code == 404


def test_get_tree_with_path(tmp_path, monkeypatch):
    """Test getting tree for a specific subdirectory."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    subdir = tmp_path / "subdir"
    subdir.mkdir()
    (subdir / "nested.md").write_text("nested content")

    response = client.get("/api/tree?path=subdir")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "nested.md"


def test_get_content_not_found(tmp_path, monkeypatch):
    """Test that requesting non-existent file returns 400."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    response = client.get("/api/content?path=nonexistent.md")
    assert response.status_code == 400


def test_get_content_binary_file(tmp_path, monkeypatch):
    """Test that binary files are handled correctly."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    # Create a binary file with non-UTF8 content
    (tmp_path / "test.bin").write_bytes(b"\x80\x81\x82\x83\xff\xfe")

    response = client.get("/api/content?path=test.bin")
    assert response.status_code == 200
    # Binary files return empty content with binary encoding
    assert response.json()["encoding"] == "binary"
    assert response.json()["content"] == ""


def test_get_git_history_no_repo(tmp_path, monkeypatch):
    """Test git history endpoint when not in a git repo."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    (tmp_path / "test.md").write_text("hello")

    response = client.get("/api/git/history?path=test.md")
    assert response.status_code == 200
    assert response.json() == []


def test_get_git_status_no_repo(tmp_path, monkeypatch):
    """Test git status endpoint when not in a git repo."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    (tmp_path / "test.md").write_text("hello")

    response = client.get("/api/git/status?path=test.md")
    assert response.status_code == 404
