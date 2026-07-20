"""SQLite-backed version history for markdown files (stdlib only).

Every save is a revertible version. Storage is a single database at
~/.dabarat/versions.db: content-addressed zlib blobs plus a versions table
carrying per-file identity (rename-surviving via aliases), timestamps,
diff stats, labels, pins, and a source tag (save/restore/external/import).

Append-only: restores add versions, nothing is destroyed. No coalescing —
an explicit save is a user-declared checkpoint; identical consecutive
content dedups by hash instead. No automatic pruning (measured-first
policy; pin/label columns exist so future pruning can respect them).

The pre-SQLite shadow git repo at ~/.dabarat/history/ is imported once on
first database creation (for every path recoverable from recents and
tab-session files) and then left untouched as a read-only archive.

Version refs are decimal ids serialized as strings; the API keeps the
historical field name "hash" so clients treat refs as opaque.
"""

import datetime
import difflib
import hashlib
import json
import os
import sqlite3
import subprocess
import time
import zlib
from contextlib import contextmanager

DB_PATH = os.path.expanduser("~/.dabarat/versions.db")
HISTORY_DIR = os.path.expanduser("~/.dabarat/history")  # legacy git archive
MAX_VERSION_BYTES = 10 * 1024 * 1024  # files beyond this are saved, not versioned

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    current_path TEXT UNIQUE NOT NULL,
    created_at_us INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS file_aliases (
    file_id INTEGER NOT NULL REFERENCES files(id),
    path TEXT UNIQUE NOT NULL,
    first_seen_us INTEGER NOT NULL,
    last_seen_us INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blobs (
    hash BLOB PRIMARY KEY,
    codec TEXT NOT NULL DEFAULT 'zlib',
    raw_size INTEGER NOT NULL,
    compressed_content BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id),
    blob_hash BLOB NOT NULL REFERENCES blobs(hash),
    created_at_us INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'save'
        CHECK (source IN ('save', 'restore', 'external', 'import')),
    added INTEGER NOT NULL DEFAULT 0,
    removed INTEGER NOT NULL DEFAULT 0,
    label TEXT,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    filepath_at_time TEXT
);
CREATE INDEX IF NOT EXISTS idx_versions_file_time
    ON versions(file_id, created_at_us DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_versions_hash ON versions(blob_hash);
"""


@contextmanager
def _db():
    """Yield a configured connection; commit open work, always close.

    Autocommit mode (isolation_level=None) — write paths take explicit
    BEGIN IMMEDIATE so the write lock is acquired up front rather than on
    first DML, and reads never open transactions at all.
    """
    os.makedirs(os.path.dirname(DB_PATH), mode=0o700, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=5.0, isolation_level=None)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        # WAL lets history reads overlap saves; verify it took (some
        # filesystems refuse) and fall back to the rollback journal
        mode = conn.execute("PRAGMA journal_mode = WAL").fetchone()[0]
        if mode.lower() != "wal":
            conn.execute("PRAGMA journal_mode = DELETE")
        # A backup store must survive power loss, not just process death
        conn.execute("PRAGMA synchronous = FULL")
        _ensure_db(conn)
        yield conn
        if conn.in_transaction:
            conn.commit()
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.close()


def _ensure_db(conn):
    fresh = not conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='versions'"
    ).fetchone()
    conn.executescript(_SCHEMA)
    if fresh:
        conn.execute("PRAGMA user_version = 1")
    _maybe_import_git(conn)


def _now_us():
    return int(time.time() * 1_000_000)


def _decode(raw):
    return raw.decode("utf-8", errors="replace")


def _diff_stats(old_text, new_text):
    diff = difflib.unified_diff(
        old_text.splitlines(), new_text.splitlines(), lineterm=""
    )
    added = removed = 0
    for line in diff:
        if line.startswith("+") and not line.startswith("+++"):
            added += 1
        elif line.startswith("-") and not line.startswith("---"):
            removed += 1
    return added, removed


def _file_id(conn, filepath, create=False):
    """Resolve a path to its file identity, following rename aliases."""
    path = os.path.abspath(filepath)
    row = conn.execute(
        "SELECT id FROM files WHERE current_path = ?", (path,)
    ).fetchone()
    if row:
        return row[0]
    row = conn.execute(
        "SELECT file_id FROM file_aliases WHERE path = ?", (path,)
    ).fetchone()
    if row:
        return row[0]
    if not create:
        return None
    now = _now_us()
    cur = conn.execute(
        "INSERT INTO files(current_path, created_at_us) VALUES (?, ?)",
        (path, now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO file_aliases(file_id, path, first_seen_us, last_seen_us)"
        " VALUES (?, ?, ?, ?)",
        (cur.lastrowid, path, now, now),
    )
    return cur.lastrowid


def _latest(conn, file_id):
    return conn.execute(
        "SELECT id, blob_hash FROM versions WHERE file_id = ?"
        " ORDER BY created_at_us DESC, id DESC LIMIT 1",
        (file_id,),
    ).fetchone()


def _blob_text(conn, blob_hash):
    row = conn.execute(
        "SELECT compressed_content FROM blobs WHERE hash = ?", (blob_hash,)
    ).fetchone()
    return _decode(zlib.decompress(row[0])) if row else ""


def _insert_version(conn, file_id, filepath, raw, source, created_at_us=None):
    """Insert a version for raw bytes; dedups against the latest. Returns id."""
    blob_hash = hashlib.sha256(raw).digest()
    latest = _latest(conn, file_id)
    if latest and latest[1] == blob_hash:
        return latest[0]
    old_text = _blob_text(conn, latest[1]) if latest else ""
    added, removed = _diff_stats(old_text, _decode(raw))
    conn.execute(
        "INSERT OR IGNORE INTO blobs(hash, raw_size, compressed_content)"
        " VALUES (?, ?, ?)",
        (blob_hash, len(raw), zlib.compress(raw, 6)),
    )
    cur = conn.execute(
        "INSERT INTO versions(file_id, blob_hash, created_at_us, source,"
        " added, removed, filepath_at_time) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (file_id, blob_hash, created_at_us or _now_us(), source,
         added, removed, os.path.abspath(filepath)),
    )
    return cur.lastrowid


def commit(filepath, content=None, source="save"):
    """Record a version. Returns its ref as a string ('' if skipped).

    When `content` is given it is recorded verbatim — callers that just
    wrote the file pass the exact string so a concurrent save can never be
    misattributed by re-reading the file after the fact.
    """
    if content is not None:
        raw = content.encode("utf-8")
    else:
        with open(filepath, "rb") as f:
            raw = f.read()
    if len(raw) > MAX_VERSION_BYTES:
        return ""
    with _db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        file_id = _file_id(conn, filepath, create=True)
        version_id = _insert_version(conn, file_id, filepath, raw, source)
        return str(version_id)


def snapshot_external(filepath, content):
    """Version externally-detected disk content. Never raises."""
    try:
        commit(filepath, content=content, source="external")
    except Exception:
        pass


def list_versions(filepath, limit=50):
    """Return newest-first [{hash, date, message, added, removed, label, pinned, source}]."""
    with _db() as conn:
        file_id = _file_id(conn, filepath)
        if file_id is None:
            return []
        basename = os.path.basename(filepath)
        rows = conn.execute(
            "SELECT id, created_at_us, source, added, removed, label, pinned"
            " FROM versions WHERE file_id = ?"
            " ORDER BY created_at_us DESC, id DESC LIMIT ?",
            (file_id, limit),
        ).fetchall()
    versions = []
    for vid, us, source, added, removed, label, pinned in rows:
        stamp = datetime.datetime.fromtimestamp(us / 1e6).astimezone()
        versions.append({
            "hash": str(vid),
            "date": stamp.isoformat(),
            "message": f"{basename} | +{added}/-{removed} | "
                       f"{stamp.strftime('%Y-%m-%d %H:%M:%S')}",
            "added": added,
            "removed": removed,
            "label": label,
            "pinned": bool(pinned),
            "source": source,
        })
    return versions


def _version_ref(ref):
    try:
        return int(ref)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid version ref: {ref!r}")


def get_version_content(filepath, ref):
    """Return content of a version, or None. The version must belong to
    the file — a valid ref for another document is not readable through
    this path."""
    version_id = _version_ref(ref)
    with _db() as conn:
        file_id = _file_id(conn, filepath)
        if file_id is None:
            return None
        row = conn.execute(
            "SELECT b.compressed_content FROM versions v"
            " JOIN blobs b ON b.hash = v.blob_hash"
            " WHERE v.id = ? AND v.file_id = ?",
            (version_id, file_id),
        ).fetchone()
    return _decode(zlib.decompress(row[0])) if row else None


def restore(filepath, ref):
    """Restore file to a version. Append-only: snapshots current state
    first, replaces atomically, then records the restore as a new version."""
    import tempfile

    content = get_version_content(filepath, ref)
    if content is None:
        return None
    if os.path.exists(filepath):
        commit(filepath)  # dedups if current state is already recorded
    fd, tmp_path = tempfile.mkstemp(
        dir=os.path.dirname(filepath), suffix=".tmp", prefix=".dabarat-"
    )
    try:
        os.write(fd, content.encode("utf-8"))
    finally:
        os.close(fd)
    os.replace(tmp_path, filepath)
    commit(filepath, content=content, source="restore")
    return content


def record_rename(old_path, new_path):
    """Carry file identity across a rename so history follows the document."""
    old_abs, new_abs = os.path.abspath(old_path), os.path.abspath(new_path)
    now = _now_us()
    with _db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        file_id = _file_id(conn, old_abs)
        if file_id is None:
            return
        conn.execute(
            "UPDATE files SET current_path = ? WHERE id = ?", (new_abs, file_id)
        )
        conn.execute(
            "INSERT INTO file_aliases(file_id, path, first_seen_us, last_seen_us)"
            " VALUES (?, ?, ?, ?)"
            " ON CONFLICT(path) DO UPDATE SET file_id = ?, last_seen_us = ?",
            (file_id, new_abs, now, now, file_id, now),
        )


def set_pinned(filepath, ref, pinned):
    """Pin/unpin a version (pinned versions are exempt from future pruning)."""
    version_id = _version_ref(ref)
    with _db() as conn:
        file_id = _file_id(conn, filepath)
        if file_id is None:
            return False
        cur = conn.execute(
            "UPDATE versions SET pinned = ? WHERE id = ? AND file_id = ?",
            (1 if pinned else 0, version_id, file_id),
        )
        return cur.rowcount > 0


def set_label(filepath, ref, label):
    """Name a version (empty label clears it)."""
    version_id = _version_ref(ref)
    with _db() as conn:
        file_id = _file_id(conn, filepath)
        if file_id is None:
            return False
        cur = conn.execute(
            "UPDATE versions SET label = ? WHERE id = ? AND file_id = ?",
            (label or None, version_id, file_id),
        )
        return cur.rowcount > 0


# ── Legacy git-repo import ──────────────────────────────────────────────

def _git_candidate_paths():
    """Paths whose legacy histories can be mapped: the git repo tracked
    files under sha256(abspath)[:12]_basename, so recovery requires
    recomputing keys from every path we know about."""
    candidates = set()
    config_dir = os.path.dirname(DB_PATH)
    recent_file = os.path.join(config_dir, "recent.json")
    try:
        with open(recent_file, encoding="utf-8") as f:
            for entry in json.load(f).get("entries", []):
                path = entry.get("path")
                if path:
                    candidates.add(os.path.abspath(path))
    except (OSError, ValueError, AttributeError):
        pass
    instances_dir = os.path.join(config_dir, "instances")
    try:
        for name in os.listdir(instances_dir):
            if not name.endswith(".tabs.json"):
                continue
            try:
                with open(os.path.join(instances_dir, name), encoding="utf-8") as f:
                    for path in json.load(f).get("tabs", []):
                        candidates.add(os.path.abspath(path))
            except (OSError, ValueError, TypeError, AttributeError):
                continue
    except OSError:
        pass
    return candidates


_import_checked = False


def _maybe_import_git(conn):
    """One-time, idempotent import of the legacy shadow git repo. The repo
    itself is left untouched as a read-only archive — unmappable paths
    (renamed or forgotten files) remain recoverable there by hand."""
    global _import_checked
    if _import_checked:
        return
    if not os.path.isdir(os.path.join(HISTORY_DIR, ".git")):
        _import_checked = True
        return
    # Cheap read first — only the losing race takes the write transaction
    if conn.execute(
        "SELECT 1 FROM meta WHERE key = 'git_import_done'"
    ).fetchone():
        _import_checked = True
        return
    conn.execute("BEGIN IMMEDIATE")
    if conn.execute(
        "SELECT 1 FROM meta WHERE key = 'git_import_done'"
    ).fetchone():
        conn.execute("COMMIT")
        _import_checked = True
        return
    try:
        for path in sorted(_git_candidate_paths()):
            key = hashlib.sha256(path.encode()).hexdigest()[:12]
            tracked = f"{key}_{os.path.basename(path)}"
            log = subprocess.run(
                ["git", "log", "--reverse", "--format=%H|%aI", "--", tracked],
                cwd=HISTORY_DIR, capture_output=True, text=True, timeout=30,
            )
            if log.returncode != 0 or not log.stdout.strip():
                continue
            revisions = []
            for line in log.stdout.strip().splitlines():
                if "|" in line:
                    revisions.append(tuple(line.split("|", 1)))
            if not revisions:
                continue
            # One cat-file --batch call streams every revision's content —
            # per-commit `git show` subprocesses would stall first launch
            # for seconds on histories this size
            batch_input = "".join(f"{h}:{tracked}\n" for h, _ in revisions)
            batch = subprocess.run(
                ["git", "cat-file", "--batch"],
                cwd=HISTORY_DIR, input=batch_input.encode(),
                capture_output=True, timeout=60,
            )
            if batch.returncode != 0:
                continue
            file_id = _file_id(conn, path, create=True)
            out = batch.stdout
            pos = 0
            for _, date_iso in revisions:
                nl = out.find(b"\n", pos)
                if nl < 0:
                    break
                header = out[pos:nl].split()
                pos = nl + 1
                if len(header) < 3 or header[1] != b"blob":
                    continue  # "<sha> missing" — nothing to consume
                size = int(header[2])
                raw = out[pos:pos + size]
                pos += size + 1  # trailing newline after each object
                try:
                    us = int(datetime.datetime.fromisoformat(date_iso)
                             .timestamp() * 1_000_000)
                except ValueError:
                    us = _now_us()
                _insert_version(conn, file_id, path, raw,
                                "import", created_at_us=us)
        conn.execute(
            "INSERT INTO meta(key, value) VALUES ('git_import_done', '1')"
        )
        conn.execute("COMMIT")
        _import_checked = True
    except Exception:
        conn.execute("ROLLBACK")
