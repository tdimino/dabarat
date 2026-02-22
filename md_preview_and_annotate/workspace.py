"""Workspace persistence — multi-root folder + pinned file workspaces.

A .dabarat-workspace file is a JSON document that defines a collection
of folders and individual files, similar to VS Code's .code-workspace.
Recent workspaces are tracked in ~/.dabarat/workspaces.json.
"""

import json
import os
import tempfile
import threading
from datetime import datetime, timezone

WORKSPACES_FILE = os.path.expanduser("~/.dabarat/workspaces.json")
MAX_RECENT_WORKSPACES = 10
WORKSPACE_EXT = ".dabarat-workspace"
CURRENT_VERSION = "1.0"

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


def _validate_workspace(data):
    """Validate workspace JSON structure. Returns cleaned dict or None."""
    if not isinstance(data, dict):
        return None
    if data.get("version") != CURRENT_VERSION:
        return None
    folders = data.get("folders", [])
    if not isinstance(folders, list):
        return None
    files = data.get("files", [])
    if not isinstance(files, list):
        return None
    # Validate folder entries (structural only — no disk existence check)
    clean_folders = []
    for f in folders:
        if isinstance(f, dict) and isinstance(f.get("path"), str):
            path = os.path.expanduser(f["path"])
            clean_folders.append({
                "path": path,
                "name": f.get("name") or os.path.basename(path),
            })
    # Validate file entries (structural only — no disk existence check)
    clean_files = []
    for f in files:
        if isinstance(f, dict) and isinstance(f.get("path"), str):
            path = os.path.expanduser(f["path"])
            clean_files.append({"path": path})
    return {
        "version": CURRENT_VERSION,
        "name": data.get("name", "Untitled"),
        "folders": clean_folders,
        "files": clean_files,
    }


# ── Workspace File CRUD ────────────────────────────────────


def read_workspace(filepath):
    """Read and validate a .dabarat-workspace file. Returns dict or None."""
    filepath = os.path.expanduser(filepath)
    if not os.path.isfile(filepath):
        return None
    try:
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        return _validate_workspace(data)
    except (json.JSONDecodeError, OSError):
        return None


def write_workspace(filepath, data):
    """Write workspace JSON atomically."""
    filepath = os.path.expanduser(filepath)
    with _lock:
        _atomic_write(filepath, data)


def create_workspace(filepath, name="Untitled", folders=None, files=None):
    """Create a new .dabarat-workspace file. Returns the workspace dict."""
    filepath = os.path.expanduser(filepath)
    data = {
        "version": CURRENT_VERSION,
        "name": name,
        "folders": [],
        "files": [],
    }
    if folders:
        for f in folders:
            path = f if isinstance(f, str) else f.get("path", "")
            display = os.path.basename(path) if isinstance(f, str) else f.get("name", os.path.basename(path))
            if path and os.path.isdir(path):
                data["folders"].append({"path": path, "name": display})
    if files:
        for f in files:
            path = f if isinstance(f, str) else f.get("path", "")
            if path and os.path.isfile(path):
                data["files"].append({"path": path})
    with _lock:
        _atomic_write(filepath, data)
    add_recent(filepath, name)
    return data


def add_folder(ws_path, folder_path, name=None):
    """Add a folder to an existing workspace. Returns updated workspace dict."""
    ws_path = os.path.expanduser(ws_path)
    folder_path = os.path.abspath(folder_path)
    with _lock:
        data = read_workspace(ws_path)
        if data is None:
            return None
        # Deduplicate by path
        existing = {f["path"] for f in data["folders"]}
        if folder_path not in existing:
            data["folders"].append({
                "path": folder_path,
                "name": name or os.path.basename(folder_path),
            })
            _atomic_write(ws_path, data)
    return data


def add_file(ws_path, file_path):
    """Add a pinned file to an existing workspace. Returns updated workspace dict."""
    ws_path = os.path.expanduser(ws_path)
    file_path = os.path.abspath(file_path)
    with _lock:
        data = read_workspace(ws_path)
        if data is None:
            return None
        # Deduplicate by path
        existing = {f["path"] for f in data["files"]}
        if file_path not in existing:
            data["files"].append({"path": file_path})
            _atomic_write(ws_path, data)
    return data


def remove_entry(ws_path, entry_path, entry_type="folder"):
    """Remove a folder or file from workspace. Returns updated workspace dict."""
    ws_path = os.path.expanduser(ws_path)
    entry_path = os.path.abspath(entry_path)
    with _lock:
        data = read_workspace(ws_path)
        if data is None:
            return None
        if entry_type == "folder":
            data["folders"] = [f for f in data["folders"] if f["path"] != entry_path]
        else:
            data["files"] = [f for f in data["files"] if f["path"] != entry_path]
        _atomic_write(ws_path, data)
    return data


def rename_workspace(ws_path, new_name):
    """Rename a workspace. Returns updated workspace dict."""
    ws_path = os.path.expanduser(ws_path)
    with _lock:
        data = read_workspace(ws_path)
        if data is None:
            return None
        data["name"] = new_name
        _atomic_write(ws_path, data)
    return data


# ── Recent Workspaces ──────────────────────────────────────


def load_recent():
    """Load recent workspaces list, pruning stale entries."""
    if not os.path.isfile(WORKSPACES_FILE):
        return []
    try:
        with open(WORKSPACES_FILE, encoding="utf-8") as f:
            data = json.load(f)
        workspaces = data.get("workspaces", [])
        # Prune entries whose files no longer exist
        valid = [w for w in workspaces if os.path.isfile(w.get("path", ""))]
        if len(valid) != len(workspaces):
            _save_recent(valid)
        return valid
    except (json.JSONDecodeError, OSError):
        return []


def _save_recent(workspaces):
    """Save recent workspaces list to disk."""
    _atomic_write(WORKSPACES_FILE, {
        "version": "1.0",
        "workspaces": workspaces[:MAX_RECENT_WORKSPACES],
    })


def add_recent(ws_path, name=None):
    """Add or update a workspace in the recent list."""
    ws_path = os.path.abspath(os.path.expanduser(ws_path))
    if not name:
        # Try to read name from workspace file
        data = read_workspace(ws_path)
        name = data.get("name", "Untitled") if data else "Untitled"
    with _lock:
        workspaces = load_recent()
        # Remove existing entry for this path
        workspaces = [w for w in workspaces if w.get("path") != ws_path]
        # Prepend new entry
        workspaces.insert(0, {
            "path": ws_path,
            "name": name,
            "lastOpened": datetime.now(timezone.utc).isoformat(),
        })
        _save_recent(workspaces)
