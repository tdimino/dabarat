"""Recent files persistence with atomic writes and staleness detection."""

import json
import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

RECENT_FILE = os.path.expanduser("~/.mdpreview/recent.json")
MAX_RECENT = 20
MAX_FILE_READ = 1 * 1024 * 1024  # 1MB for metadata extraction
ALLOWED_EXT = {".md", ".markdown", ".txt"}

_lock = threading.Lock()


def _atomic_write(filepath, data):
    """Write JSON atomically via temp file + os.replace()."""
    json_str = json.dumps(data, indent=2)
    dir_name = os.path.dirname(filepath)
    os.makedirs(dir_name, mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json_str)
        os.replace(tmp, filepath)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise



def _validate_entry(entry):
    """Validate a recent entry before reading its file."""
    path = entry.get("path", "")
    if not isinstance(path, str) or not os.path.isfile(path):
        return False
    _, ext = os.path.splitext(path)
    if ext.lower() not in ALLOWED_EXT:
        return False
    try:
        if os.stat(path).st_size > MAX_FILE_READ:
            return False
    except Exception:
        return False
    return True


def _extract_summary(filepath, max_chars=200):
    """Extract first non-header paragraph, stripped of formatting."""
    try:
        text = Path(filepath).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    # Strip YAML frontmatter
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            text = parts[2]
    # Strip code blocks
    text = re.sub(r"```[\s\S]*?```", "", text)
    # Find first paragraph (non-header, non-list)
    for para in re.split(r"\n\s*\n+", text.strip()):
        if para.startswith("#") or re.match(r"^\s*[-*+]\s", para):
            continue
        clean = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", para)  # strip links
        clean = re.sub(r"!\[.*?\]\([^\)]+\)", "", clean)  # strip images
        clean = re.sub(r"[*_`~]+", "", clean)  # strip emphasis
        clean = clean.strip()
        if clean:
            return clean[:max_chars] + ("..." if len(clean) > max_chars else "")
    return ""


def load():
    """Load recent entries, pruning stale ones."""
    if not os.path.isfile(RECENT_FILE):
        return []
    try:
        with open(RECENT_FILE, encoding="utf-8") as f:
            data = json.load(f)
        entries = data.get("entries", [])
        valid = [e for e in entries if _validate_entry(e)]
        if len(valid) != len(entries):
            save(valid)
        return valid
    except Exception:
        return []


def save(entries):
    """Save entries to disk."""
    _atomic_write(RECENT_FILE, {"version": "1.0", "entries": entries[:MAX_RECENT]})


def add_entry(filepath, content=None, tags=None):
    """Add or update a recent file entry (called on every file open)."""
    path = os.path.abspath(filepath)
    with _lock:
        entries = load()
        entries = [e for e in entries if e["path"] != path]
        entry = {
            "path": path,
            "filename": os.path.basename(path),
            "lastOpened": datetime.now(timezone.utc).isoformat(),
            "wordCount": len((content or "").split()),
            "annotationCount": 0,
            "versionCount": 0,
            "tags": tags or [],
            "summary": _extract_summary(path),
        }
        entries = [entry] + entries[: MAX_RECENT - 1]
        save(entries)
