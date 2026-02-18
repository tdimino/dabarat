"""Git-backed version history for markdown files (stdlib + git CLI)."""

import datetime
import difflib
import hashlib
import os
import re
import subprocess

HISTORY_DIR = os.path.expanduser("~/.mdpreview/history")
GIT_HASH_RE = re.compile(r"^[0-9a-f]{4,40}$")

_version_cache = {}  # filepath -> (head_hash, versions_list)


def _ensure_repo():
    """Initialize git repo if needed."""
    git_dir = os.path.join(HISTORY_DIR, ".git")
    if not os.path.isdir(git_dir):
        os.makedirs(HISTORY_DIR, mode=0o700, exist_ok=True)
        subprocess.run(
            ["git", "init"], cwd=HISTORY_DIR, capture_output=True, timeout=10
        )
        subprocess.run(
            ["git", "config", "user.name", "mdpreview"],
            cwd=HISTORY_DIR, capture_output=True, timeout=5,
        )
        subprocess.run(
            ["git", "config", "user.email", "system@mdpreview"],
            cwd=HISTORY_DIR, capture_output=True, timeout=5,
        )


def _validate_hash(value):
    """Validate git hash. Raises ValueError if invalid."""
    if not isinstance(value, str) or not GIT_HASH_RE.match(value):
        raise ValueError(f"Invalid git hash: {value}")
    return value


def _file_key(filepath):
    """Stable key for a file based on absolute path."""
    return hashlib.sha256(os.path.abspath(filepath).encode()).hexdigest()[:12]


def _tracked_name(filepath):
    """Return the filename used in the history repo."""
    key = _file_key(filepath)
    basename = os.path.basename(filepath)
    return f"{key}_{basename}"


def commit(filepath):
    """Copy file into history repo, commit with embedded diff stats. Returns commit hash."""
    _ensure_repo()
    dest = os.path.join(HISTORY_DIR, _tracked_name(filepath))

    # Read old content for diff stats
    old_content = ""
    if os.path.exists(dest):
        with open(dest, encoding="utf-8", errors="replace") as f:
            old_content = f.read()

    with open(filepath, encoding="utf-8", errors="replace") as src:
        new_content = src.read()

    # Skip if content unchanged
    if old_content == new_content:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=HISTORY_DIR, capture_output=True, text=True, timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else ""

    with open(dest, "w", encoding="utf-8") as dst:
        dst.write(new_content)

    # Compute diff stats
    old_lines = old_content.splitlines()
    new_lines = new_content.splitlines()
    diff = list(difflib.unified_diff(old_lines, new_lines, lineterm=""))
    added = sum(1 for l in diff if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff if l.startswith("-") and not l.startswith("---"))

    basename = os.path.basename(filepath)
    subprocess.run(
        ["git", "add", "--", os.path.basename(dest)],
        cwd=HISTORY_DIR, capture_output=True, timeout=10,
    )
    msg = (
        f"{basename} | +{added}/-{removed} | "
        f"{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )
    subprocess.run(
        ["git", "commit", "-m", msg],
        cwd=HISTORY_DIR, capture_output=True, timeout=10,
    )
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=HISTORY_DIR, capture_output=True, text=True, timeout=5,
    )

    # Invalidate cache
    _version_cache.pop(os.path.abspath(filepath), None)

    return result.stdout.strip() if result.returncode == 0 else ""


def list_versions(filepath, limit=50):
    """Return list of {hash, date, message, added, removed} for a file. Cached."""
    _ensure_repo()
    tracked = _tracked_name(filepath)
    abs_path = os.path.abspath(filepath)

    # Check cache validity via HEAD hash
    head_result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=HISTORY_DIR, capture_output=True, text=True, timeout=5,
    )
    head = head_result.stdout.strip() if head_result.returncode == 0 else ""

    cached = _version_cache.get(abs_path)
    if cached and cached[0] == head:
        return cached[1]

    result = subprocess.run(
        ["git", "log", "--format=%H|%aI|%s", "-n", str(limit), "--", tracked],
        cwd=HISTORY_DIR, capture_output=True, text=True, timeout=10,
    )
    versions = []
    for line in result.stdout.strip().split("\n"):
        if "|" not in line:
            continue
        h, date, msg = line.split("|", 2)
        added, removed = 0, 0
        stats_match = re.search(r"\+(\d+)/-(\d+)", msg)
        if stats_match:
            added, removed = int(stats_match.group(1)), int(stats_match.group(2))
        versions.append({
            "hash": h,
            "date": date,
            "message": msg,
            "added": added,
            "removed": removed,
        })

    _version_cache[abs_path] = (head, versions)
    return versions


def get_version_content(filepath, commit_hash):
    """Return file content at a specific version."""
    _validate_hash(commit_hash)
    _ensure_repo()
    tracked = _tracked_name(filepath)
    result = subprocess.run(
        ["git", "show", f"{commit_hash}:{tracked}"],
        cwd=HISTORY_DIR, capture_output=True, text=True, timeout=10,
    )
    return result.stdout if result.returncode == 0 else None


def restore(filepath, commit_hash):
    """Restore file to a specific version. Auto-commits current first."""
    _validate_hash(commit_hash)
    commit(filepath)  # Save current state before restoring
    content = get_version_content(filepath, commit_hash)
    if content is not None:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        commit(filepath)  # Commit the restore as a new version
    return content
