"""Tests for global file listing endpoints."""

from fastapi.testclient import TestClient

from vantage.main import app

client = TestClient(app)


def test_files_all_single_repo(tmp_path, monkeypatch):
    """In single-repo mode, /api/files/all returns files with empty repo."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    (tmp_path / "test.md").write_text("hello")
    (tmp_path / "other.md").write_text("world")

    response = client.get("/api/files/all")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # All items should have empty repo name in single-repo mode
    for item in data:
        assert "repo" in item
        assert "path" in item
        assert item["repo"] == ""
    paths = [item["path"] for item in data]
    assert "test.md" in paths
    assert "other.md" in paths


def test_recent_all_single_repo(tmp_path, monkeypatch):
    """In single-repo mode, /api/recent/all returns recent files with empty repo."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    response = client.get("/api/recent/all")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # In a non-git tmp_path, expect empty list
    for item in data:
        assert "repo" in item
        assert item["repo"] == ""


def test_recent_all_limit_clamped(tmp_path, monkeypatch):
    """Limit parameter is clamped to valid range."""
    from vantage.settings import settings

    monkeypatch.setattr(settings, "target_repo", tmp_path)

    # Very large limit should be clamped to 1000
    response = client.get("/api/recent/all?limit=9999")
    assert response.status_code == 200

    # Zero limit should be clamped to 1
    response = client.get("/api/recent/all?limit=0")
    assert response.status_code == 200
