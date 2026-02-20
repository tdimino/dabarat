"""Recent files persistence with atomic writes and staleness detection."""

import json
import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

RECENT_FILE = os.path.expanduser("~/.dabarat/recent.json")
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
    # Strip HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Find first paragraph (non-header, non-list)
    for para in re.split(r"\n\s*\n+", text.strip()):
        if para.startswith("#") or re.match(r"^\s*[-*+]\s", para):
            continue
        clean = re.sub(r"<[^>]+>", "", para)  # strip any remaining HTML
        clean = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", clean)  # strip links
        clean = re.sub(r"!\[.*?\]\([^\)]+\)", "", clean)  # strip images
        clean = re.sub(r"[*_`~]+", "", clean)  # strip emphasis
        clean = " ".join(clean.split())  # collapse whitespace
        clean = clean.strip()
        if clean:
            return clean[:max_chars] + ("..." if len(clean) > max_chars else "")
    return ""


def _extract_preview(filepath, max_chars=500):
    """Extract first portion of markdown for rendered preview (preserving formatting)."""
    try:
        text = Path(filepath).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    # Strip YAML frontmatter
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            text = parts[2]
    # Strip HTML tags (images, alignment divs, etc.)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.strip()
    # Take first N chars, try to break at a paragraph boundary
    if len(text) > max_chars:
        # Find last double-newline before max_chars
        cut = text.rfind("\n\n", 0, max_chars)
        if cut > max_chars // 3:
            text = text[:cut]
        else:
            text = text[:max_chars]
    return text.strip()


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


def _extract_word_count(filepath):
    """Count words in a markdown file."""
    try:
        text = Path(filepath).read_text(encoding="utf-8", errors="ignore")
        # Strip frontmatter
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                text = parts[2]
        return len(text.split())
    except Exception:
        return 0


def _extract_preview_image(filepath):
    """Extract first image path from markdown, returning absolute path or URL."""
    try:
        raw = Path(filepath).read_text(encoding="utf-8", errors="ignore")
        img_match = re.search(r"!\[.*?\]\(([^)]+)\)", raw)
        if img_match:
            img_path = img_match.group(1)
            if not img_path.startswith(("http://", "https://")):
                img_path = os.path.join(os.path.dirname(filepath), img_path)
                if os.path.isfile(img_path):
                    return img_path
                return ""
            return img_path
    except Exception:
        pass
    return ""


def _count_annotations(filepath):
    """Count active annotations for a file."""
    try:
        from . import annotations as _ann_mod
        data, _ = _ann_mod.read(filepath)
        return len(data.get("annotations", []))
    except Exception:
        return 0


def _count_versions(filepath):
    """Count version history entries for a file."""
    try:
        from . import history as _hist_mod
        return len(_hist_mod.list_versions(filepath))
    except Exception:
        return 0


def remove_entry(filepath):
    """Remove a file from recent entries."""
    path = os.path.abspath(filepath)
    with _lock:
        entries = load()
        entries = [e for e in entries if e["path"] != path]
        save(entries)


def add_entry(filepath, content=None, tags=None):
    """Add or update a recent file entry (called on every file open)."""
    path = os.path.abspath(filepath)
    with _lock:
        entries = load()
        entries = [e for e in entries if e["path"] != path]
        # Detect first image in the markdown for card preview
        preview_image = ""
        try:
            raw = Path(path).read_text(encoding="utf-8", errors="ignore")
            img_match = re.search(r"!\[.*?\]\(([^)]+)\)", raw)
            if img_match:
                img_path = img_match.group(1)
                if not img_path.startswith(("http://", "https://")):
                    img_path = os.path.join(os.path.dirname(path), img_path)
                    if os.path.isfile(img_path):
                        preview_image = img_path
                else:
                    preview_image = img_match.group(1)
        except Exception:
            pass

        # Extract frontmatter badges
        fm_badges = {}
        try:
            from . import frontmatter as _fm_mod
            fm, _ = _fm_mod.get_frontmatter(path)
            if fm:
                for k in ("type", "model", "version", "status"):
                    if k in fm:
                        fm_badges[k] = str(fm[k])
        except Exception:
            pass

        entry = {
            "path": path,
            "filename": os.path.basename(path),
            "lastOpened": datetime.now(timezone.utc).isoformat(),
            "wordCount": len((content or "").split()),
            "annotationCount": _count_annotations(path),
            "versionCount": _count_versions(path),
            "tags": tags or [],
            "summary": _extract_summary(path),
            "preview": _extract_preview(path),
            "previewImage": preview_image,
            "frontmatter": fm_badges if fm_badges else None,
        }
        entries = [entry] + entries[: MAX_RECENT - 1]
        save(entries)
