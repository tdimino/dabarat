"""Sidecar JSON I/O for margin annotations.

Integrity (2026-09-06): every write is atomic (tempfile + os.replace, the
_write_config precedent) and every read-modify-write runs under a per-file
lock — the polling GET, the annotate/resolve/reply POSTs and orphan cleanup
all touch the same sidecar from different ThreadingHTTPServer threads, and
a bare open("w") let the last writer win. A sidecar that fails to parse is
set aside as `<sidecar>.corrupt-<timestamp>` instead of being read as empty
and then overwritten; the notice is surfaced once to the client.
"""

import json
import os
import sys
import tempfile
import threading
import time
from contextlib import contextmanager

_locks = {}                 # sidecar path → RLock
_locks_guard = threading.Lock()
_corrupt_notices = {}       # filepath → backup path (consumed by the server)


def get_path(filepath):
    """Return the sidecar annotation path for a markdown file."""
    return filepath + ".annotations.json"


def get_resolved_path(filepath):
    """Return the resolved archive path for a markdown file."""
    return filepath + ".annotations.resolved.json"


def _lock_for(filepath):
    key = os.path.abspath(filepath)
    with _locks_guard:
        lock = _locks.get(key)
        if lock is None:
            lock = _locks[key] = threading.RLock()
        return lock


@contextmanager
def locked(filepath):
    """Hold the sidecar lock across a read-modify-write. Re-entrant, so
    read()/write() inside the block take it again without deadlocking."""
    lock = _lock_for(filepath)
    lock.acquire()
    try:
        yield
    finally:
        lock.release()


def _quarantine(path):
    """Move a sidecar that no longer parses out of the way, keeping it."""
    backup = f"{path}.corrupt-{int(time.time())}"
    try:
        os.replace(path, backup)
    except OSError:
        return None
    print(f"Warning: annotation sidecar {path} did not parse — kept as "
          f"{os.path.basename(backup)}", file=sys.stderr)
    return backup


def pop_corrupt_notice(filepath):
    """Backup path of a sidecar quarantined since the last call, or None."""
    return _corrupt_notices.pop(filepath, None)


def _read_json(path, default, *, notice_key=None, quarantine=True):
    """Parse a sidecar. Missing → default. Unparseable → default, and when
    `quarantine` is set the file is moved aside and a notice recorded under
    `notice_key` (the markdown path the server asks about). Read-only
    listings pass quarantine=False: a directory browse must never rename a
    file another instance may still be writing. Any other OSError
    (permissions, I/O) propagates — a read-modify-write that treated it
    as "empty" would overwrite the sidecar with nothing."""
    try:
        mtime = os.path.getmtime(path)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("sidecar root is not an object")
        return data, mtime
    except FileNotFoundError:
        return default, 0
    except ValueError:
        if quarantine:
            backup = _quarantine(path)
            if backup:
                _corrupt_notices[notice_key or path] = backup
        return default, 0


def _write_json(path, data):
    directory = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".ann-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read(filepath, quarantine=True):
    """Read annotations for a file. Returns (data_dict, mtime).
    quarantine=False for listings (browse-dir, home cards): report the
    sidecar as empty but leave the file alone."""
    with locked(filepath):
        data, mtime = _read_json(get_path(filepath),
                                 {"version": 1, "annotations": []},
                                 notice_key=filepath, quarantine=quarantine)
        data.setdefault("annotations", [])
        return data, mtime


def read_resolved(filepath):
    """Read resolved annotations archive. Returns data_dict."""
    with locked(filepath):
        data, _ = _read_json(get_resolved_path(filepath),
                             {"version": 1, "resolved": []},
                             notice_key=filepath)
        data.setdefault("resolved", [])
        return data


def write(filepath, data):
    """Write annotations to the sidecar JSON file (atomic, locked)."""
    with locked(filepath):
        _write_json(get_path(filepath), data)


def write_resolved(filepath, data):
    """Write resolved archive to the sidecar JSON file (atomic, locked)."""
    with locked(filepath):
        _write_json(get_resolved_path(filepath), data)


def read_tags(filepath, quarantine=True):
    """Read tags for a file. Returns list of tag strings."""
    data, _ = read(filepath, quarantine=quarantine)
    return data.get("tags", [])


def add_tag(filepath, tag):
    """Add a tag to a file. Returns updated tag list."""
    with locked(filepath):
        data, _ = read(filepath)
        tags = data.get("tags", [])
        tag = tag.strip().lower()
        if tag and tag not in tags:
            tags.append(tag)
            data["tags"] = tags
            write(filepath, data)
        return tags


def remove_tag(filepath, tag):
    """Remove a tag from a file. Returns updated tag list."""
    with locked(filepath):
        data, _ = read(filepath)
        tags = data.get("tags", [])
        tag = tag.strip().lower()
        tags = [t for t in tags if t != tag]
        data["tags"] = tags
        write(filepath, data)
        return tags


def cleanup_orphans(filepath, content):
    """Remove annotations whose anchor text no longer exists in the document.

    Returns the number of orphans removed."""
    with locked(filepath):
        data, _ = read(filepath)
        anns = data.get("annotations", [])
        if not anns:
            return 0

        kept = []
        removed = 0
        for ann in anns:
            anchor = ann.get("anchor", {})
            anchor_text = anchor.get("text", "") if isinstance(anchor, dict) else ""
            if anchor_text and anchor_text not in content:
                removed += 1
            else:
                kept.append(ann)

        if removed > 0:
            data["annotations"] = kept
            write(filepath, data)

        return removed
