"""Server-side storage for review mode data (snapshots + comments).

Data lives in ~/.local/share/vantage/reviews/ as one JSON file per reviewed
document.  File paths are encoded by replacing / with __ and prefixing with
the repo name in multi-repo mode.
"""

import logging
import tempfile
from pathlib import Path

from vantage.schemas.models import ReviewData

logger = logging.getLogger(__name__)

REVIEW_DIR = Path.home() / ".local" / "share" / "vantage" / "reviews"


def _review_file(file_path: str, repo: str | None = None) -> Path:
    """Return the on-disk path for a review JSON file."""
    safe = file_path.replace("/", "__").replace("\\", "__")
    if repo:
        safe = f"{repo}__{safe}"
    return REVIEW_DIR / f"{safe}.json"


def get_review(file_path: str, repo: str | None = None) -> ReviewData | None:
    p = _review_file(file_path, repo)
    if not p.exists():
        return None
    try:
        return ReviewData.model_validate_json(p.read_text())
    except Exception:
        logger.warning("Failed to read review file %s", p)
        return None


def save_review(file_path: str, data: ReviewData, repo: str | None = None) -> None:
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    p = _review_file(file_path, repo)
    # Atomic write via temp file + rename
    with tempfile.NamedTemporaryFile(mode="w", dir=REVIEW_DIR, suffix=".tmp", delete=False) as fd:
        fd.write(data.model_dump_json(indent=2))
        tmp_path = Path(fd.name)
    try:
        tmp_path.rename(p)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def delete_review(file_path: str, repo: str | None = None) -> bool:
    p = _review_file(file_path, repo)
    if p.exists():
        p.unlink()
        return True
    return False
