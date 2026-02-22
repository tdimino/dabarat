#!/usr/bin/env python3
"""CLI entry point for md_preview_and_annotate.

Usage:
  python3 md_preview_and_annotate <file.md> [file2.md ...] [--port PORT] [--author NAME]
  python3 md_preview_and_annotate --workspace <path.dabarat-workspace>
  python3 md_preview_and_annotate --add <file.md> [--port PORT]
  python3 md_preview_and_annotate --annotate <file.md> --text "..." --comment "..." [--author NAME]
  --max-instances N   Limit concurrent server instances (default 5)
"""

import atexit
import datetime
import json
import os
import signal
import sys
import uuid

from . import annotations
from . import bookmarks
from . import workspace
from .server import PreviewHandler, start

DEFAULT_PORT = 3031
MAX_INSTANCES = 5
_INSTANCE_DIR = os.path.join(os.path.expanduser("~"), ".dabarat", "instances")


def _migrate_config_dir():
    """One-time migration: ~/.mdpreview/ → ~/.dabarat/"""
    old = os.path.expanduser("~/.mdpreview")
    new = os.path.expanduser("~/.dabarat")
    if not os.path.isdir(old):
        return
    os.makedirs(new, exist_ok=True)
    # Move individual items that don't already exist in new dir
    for name in os.listdir(old):
        src = os.path.join(old, name)
        dst = os.path.join(new, name)
        if not os.path.exists(dst):
            try:
                os.rename(src, dst)
            except OSError:
                import shutil
                try:
                    if os.path.isdir(src):
                        shutil.copytree(src, dst)
                    else:
                        shutil.copy2(src, dst)
                except OSError:
                    pass


def _flag_value(argv, flag, default=""):
    """Safely get the value following a --flag, or return default."""
    if flag in argv:
        idx = argv.index(flag)
        if idx + 1 < len(argv):
            return argv[idx + 1]
    return default


def _ensure_instance_dir():
    os.makedirs(_INSTANCE_DIR, exist_ok=True)


def _pid_alive(pid):
    """Check if a process with the given PID is still running."""
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def _live_instances():
    """Return list of (port, pid) for all live instances, cleaning stale ones."""
    _ensure_instance_dir()
    live = []
    for fname in os.listdir(_INSTANCE_DIR):
        if not fname.endswith(".pid"):
            continue
        fpath = os.path.join(_INSTANCE_DIR, fname)
        try:
            with open(fpath) as f:
                pid = int(f.read().strip())
            if _pid_alive(pid):
                port = int(fname.replace(".pid", ""))
                live.append((port, pid))
            else:
                os.remove(fpath)
        except (ValueError, OSError):
            try:
                os.remove(fpath)
            except OSError:
                pass
    return live


def _register_instance(port, server=None):
    """Write a PID file for this instance and register cleanup."""
    _ensure_instance_dir()
    pidfile = os.path.join(_INSTANCE_DIR, f"{port}.pid")
    with open(pidfile, "w") as f:
        f.write(str(os.getpid()))

    def _cleanup(*_args):
        try:
            os.remove(pidfile)
        except OSError:
            pass

    atexit.register(_cleanup)

    def _sigterm_handler(*_args):
        _cleanup()
        if server:
            server.shutdown()
        else:
            sys.exit(0)

    signal.signal(signal.SIGTERM, _sigterm_handler)


def cmd_annotate(argv):
    """Write an annotation directly to the sidecar JSON (no server needed)."""
    _migrate_config_dir()
    idx = argv.index("--annotate")
    if idx + 1 >= len(argv):
        print("Error: --annotate requires a filepath")
        sys.exit(1)
    filepath = os.path.abspath(argv[idx + 1])

    text = _flag_value(argv, "--text")
    comment = _flag_value(argv, "--comment")
    author_name = _flag_value(argv, "--author", "Claude")
    ann_type = _flag_value(argv, "--type", "comment")

    data, _ = annotations.read(filepath)

    ann = {
        "id": uuid.uuid4().hex[:6],
        "anchor": {"text": text, "heading": "", "offset": 0},
        "author": {
            "name": author_name,
            "type": "ai" if author_name.lower() in ("claude", "ai", "assistant") else "human",
        },
        "created": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "body": comment,
        "type": ann_type,
        "resolved": False,
        "replies": [],
    }
    data["annotations"].append(ann)
    annotations.write(filepath, data)

    if ann_type == "bookmark":
        bookmarks.save(
            anchor_text=text,
            body=comment,
            author=author_name,
            source_file=filepath,
            ann_id=ann["id"],
        )

    print(f"\033[38;2;166;227;161m\u2713\033[0m Annotation by {author_name} on \"{text}\"")


def cmd_add(argv):
    """POST a file to a running server, then exit."""
    import urllib.request

    idx = argv.index("--add")
    if idx + 1 >= len(argv):
        print("Error: --add requires a filepath")
        sys.exit(1)
    filepath = os.path.abspath(argv[idx + 1])
    port = int(_flag_value(argv, "--port", str(DEFAULT_PORT)))

    req_data = json.dumps({"filepath": filepath}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/add",
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "Origin": f"http://127.0.0.1:{port}",
        },
    )
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print(f"\033[38;2;166;227;161m\u2713\033[0m Added: {result['filename']}")
    except Exception as e:
        print(f"\033[38;2;243;139;168m\u2717\033[0m Failed to add: {e}")
        sys.exit(1)


def _clear_pyc():
    """Remove stale .pyc files so template/static changes take effect."""
    cache_dir = os.path.join(os.path.dirname(__file__), "__pycache__")
    if os.path.isdir(cache_dir):
        for f in os.listdir(cache_dir):
            if f.endswith(".pyc"):
                os.remove(os.path.join(cache_dir, f))


def _kill_port(port):
    """Kill any process listening on the given port (SIGTERM then SIGKILL)."""
    import subprocess
    import time

    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True, timeout=3,
        )
        pids = [int(p) for p in result.stdout.strip().split() if p]
        if not pids:
            return
        # Graceful first — lets atexit/SIGTERM handlers clean up PID files
        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
            except (ProcessLookupError, ValueError):
                pass
        time.sleep(0.5)
        # Escalate for any survivors
        for pid in pids:
            if _pid_alive(pid):
                try:
                    os.kill(pid, signal.SIGKILL)
                except (ProcessLookupError, ValueError):
                    pass
        time.sleep(0.3)
    except Exception:
        pass
    # Remove stale PID file for this port regardless
    stale = os.path.join(_INSTANCE_DIR, f"{port}.pid")
    try:
        os.remove(stale)
    except OSError:
        pass


def _server_running(port):
    """Check if a mark server is already running on the given port."""
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/tabs", method="GET")
        urllib.request.urlopen(req, timeout=1)
        return True
    except Exception:
        return False


def _get_open_filepaths(port):
    """Get list of filepaths currently open in the running server."""
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/tabs")
        resp = urllib.request.urlopen(req, timeout=2)
        tab_list = json.loads(resp.read())
        return [t["filepath"] for t in tab_list]
    except Exception:
        return []


def _ask_reuse_dialog(already_open, new_files):
    """Show macOS native dialog asking to add to existing or open new window."""
    import platform
    import subprocess

    if platform.system() != "Darwin":
        return True

    parts = []
    if already_open:
        names = ", ".join(os.path.basename(f) for f in already_open)
        parts.append(f"Already open: {names}")
    if new_files:
        names = ", ".join(os.path.basename(f) for f in new_files)
        parts.append(f"New: {names}")
    msg = "\\n".join(parts) if parts else "Dabarat is already running."

    script = (
        f'display dialog "{msg}" '
        f'with title "Dabarat is already running" '
        f'buttons {{"Open New Window", "Add to Existing"}} '
        f'default button "Add to Existing"'
    )
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=30,
        )
        return "Add to Existing" in result.stdout
    except Exception:
        return True


def _add_to_running(port, files):
    """Add files to a running server as new tabs."""
    import urllib.request
    added = []
    for fp in files:
        try:
            req_data = json.dumps({"filepath": fp}).encode()
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/add",
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "Origin": f"http://127.0.0.1:{port}",
                },
            )
            resp = urllib.request.urlopen(req, timeout=3)
            result = json.loads(resp.read())
            label = "already open" if result.get("existing") else "added"
            added.append((result.get("filename", os.path.basename(fp)), label))
        except Exception as e:
            added.append((os.path.basename(fp), f"failed: {e}"))
    return added


def cmd_serve(argv):
    """Start the preview server with one or more files."""
    import subprocess
    import webbrowser

    _migrate_config_dir()

    port = int(_flag_value(argv, "--port", str(DEFAULT_PORT)))
    default_author = _flag_value(argv, "--author", "Tom")
    max_inst = int(_flag_value(argv, "--max-instances", str(MAX_INSTANCES)))
    ws_path = _flag_value(argv, "--workspace", "")

    # Collect file paths
    files = []
    skip_next = False
    for i, arg in enumerate(argv[1:], 1):
        if skip_next:
            skip_next = False
            continue
        if arg.startswith("--"):
            if arg in ("--port", "--author", "--max-instances", "--workspace"):
                skip_next = True
            continue
        files.append(os.path.abspath(arg))

    # Load workspace if specified
    if ws_path:
        ws_path = os.path.abspath(ws_path)
        ws_data = workspace.read_workspace(ws_path)
        if ws_data is None:
            print(f"\033[38;2;243;139;168m\u2717\033[0m Invalid workspace: {ws_path}")
            sys.exit(1)
        # Set server-side workspace state
        import md_preview_and_annotate.server as _srv
        _srv._active_workspace_path = ws_path
        _srv._active_workspace = ws_data
        workspace.add_recent(ws_path, ws_data.get("name"))

    if not files and not ws_path:
        print("Error: no files specified")
        sys.exit(1)

    # Tab reuse: if a server is already running, ask what to do
    if _server_running(port):
        open_paths = _get_open_filepaths(port)
        already_open = [f for f in files if f in open_paths]
        new_files = [f for f in files if f not in open_paths]

        if _ask_reuse_dialog(already_open, new_files):
            results = _add_to_running(port, files)
            for name, status in results:
                icon = "\033[38;2;166;227;161m\u2713\033[0m" if "fail" not in status else "\033[38;2;243;139;168m\u2717\033[0m"
                print(f"{icon} {name} ({status})")
            print(f"\033[38;2;88;91;112mServer already running at http://127.0.0.1:{port}\033[0m")
            sys.exit(0)
        else:
            _kill_port(port)

    # Instance limit: refuse to start if too many are already running
    live = _live_instances()
    if len(live) >= max_inst:
        print(f"\033[38;2;243;139;168m\u2717 Instance limit reached ({len(live)}/{max_inst})\033[0m")
        for p, pid in sorted(live):
            print(f"  \033[38;2;137;180;250m\u25cf\033[0m http://127.0.0.1:{p}  (pid {pid})")
        print(f"\n\033[38;2;88;91;112mUse --add to open files in an existing instance,")
        print(f"or --max-instances N to raise the limit.\033[0m")
        sys.exit(1)

    _clear_pyc()
    _kill_port(port)

    PreviewHandler.default_author = default_author
    for fp in files:
        if os.path.isfile(fp):
            PreviewHandler.add_tab(fp)
        else:
            print(f"Warning: {fp} not found, skipping")

    if not PreviewHandler._tabs and not ws_path:
        print("Error: no valid files to open")
        sys.exit(1)

    server = start(port)
    _register_instance(port, server)

    if PreviewHandler._tabs:
        filenames = [os.path.basename(t["filepath"]) for t in PreviewHandler._tabs.values()]
        print(f"\033[38;2;137;180;250m\U0001f4c4 {', '.join(filenames)}\033[0m")
    elif ws_path:
        ws_name = ws_data.get("name", os.path.basename(ws_path))
        n_folders = len(ws_data.get("folders", []))
        n_files = len(ws_data.get("files", []))
        print(f"\033[38;2;137;180;250m\U0001f4c1 {ws_name} ({n_folders} folders, {n_files} files)\033[0m")
    print(f"\033[38;2;166;227;161m\U0001f310 http://127.0.0.1:{port}\033[0m")
    inst_count = len(_live_instances())
    features = "Live reload \u00b7 Catppuccin \u00b7 Tabs \u00b7 Annotations"
    if ws_path:
        features += " \u00b7 Workspace"
    print(f"\033[38;2;88;91;112m\u26a1 {features} \u00b7 Instance {inst_count}/{max_inst}\033[0m")
    print("\nCtrl+C to stop")

    # Launch in Chrome --app mode
    url = f"http://127.0.0.1:{port}"
    chrome_paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ]
    chrome = next((p for p in chrome_paths if os.path.exists(p)), None)
    if chrome:
        subprocess.Popen(
            [chrome, f"--app={url}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\033[38;2;88;91;112mStopped.\033[0m")
        server.server_close()


def main():
    if "--annotate" in sys.argv:
        cmd_annotate(sys.argv)
        sys.exit(0)

    if "--add" in sys.argv:
        cmd_add(sys.argv)
        sys.exit(0)

    if len(sys.argv) < 2:
        print("Usage:")
        print("  dabarat <file.md> [file2.md ...] [--port PORT] [--author NAME]")
        print("  dabarat --workspace <path.dabarat-workspace> [--port PORT]")
        print("  dabarat --add <file.md> [--port PORT]")
        print('  dabarat --annotate <file.md> --text "..." --comment "..." [--author NAME]')
        print(f"  --max-instances N  (default {MAX_INSTANCES})")
        sys.exit(1)

    cmd_serve(sys.argv)


if __name__ == "__main__":
    main()
