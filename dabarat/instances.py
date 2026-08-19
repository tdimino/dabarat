"""Instance discovery shared by the CLI launcher and the running server.

PID files live in ~/.dabarat/instances/<port>.pid as JSON
{pid, port, started} (legacy plain-int files still parse). A PID being
alive is not proof it is dabarat — PIDs get reused — so instances must
also answer /api/tabs, with a 30s startup grace period before an
unresponsive one is declared stale.
"""

import datetime
import json
import os
import urllib.request

INSTANCE_DIR = os.path.join(os.path.expanduser("~"), ".dabarat", "instances")


def ensure_instance_dir():
    os.makedirs(INSTANCE_DIR, exist_ok=True)


def pid_alive(pid):
    """Check if a process with the given PID is still running."""
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def server_running(port, timeout=1):
    """Check if a dabarat server is answering on the given port."""
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/tabs", method="GET")
        urllib.request.urlopen(req, timeout=timeout)
        return True
    except Exception:
        return False


def get_open_filepaths(port, timeout=2):
    """Get list of filepaths currently open in the running server."""
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/tabs")
        resp = urllib.request.urlopen(req, timeout=timeout)
        tab_list = json.loads(resp.read())
        return [t["filepath"] for t in tab_list]
    except Exception:
        return []


def scan_live(assume_running=None):
    """Return [(port, pid, started_iso|None)] for all live instances,
    cleaning stale PID files. `assume_running` skips the HTTP probe for
    that port — the caller (a running server) knows it is alive.
    """
    ensure_instance_dir()
    live = []
    for fname in os.listdir(INSTANCE_DIR):
        if not fname.endswith(".pid"):
            continue
        fpath = os.path.join(INSTANCE_DIR, fname)
        try:
            # The filename is authoritative for the port; JSON contents are
            # advisory and bounded (a malformed file must never abort the
            # scan or fabricate a permanently-live instance)
            port = int(fname[: -len(".pid")])
            with open(fpath) as f:
                raw = f.read(4096).strip()
            started = None
            try:
                data = json.loads(raw)
                if not isinstance(data, dict):
                    raise ValueError("not an object")
                pid = int(data["pid"])
                s = data.get("started")
                started = s if isinstance(s, str) else None
            except (json.JSONDecodeError, ValueError, TypeError, KeyError):
                pid = int(raw)  # legacy plain-int format
            if pid <= 1:
                raise ValueError("implausible pid")

            if pid_alive(pid):
                if port == assume_running or server_running(port):
                    live.append((port, pid, started))
                    continue
                # Alive but not serving: PID reuse, or still starting up.
                # Grace only for a valid, non-future, recent timestamp.
                if started:
                    try:
                        age = (
                            datetime.datetime.now(datetime.timezone.utc)
                            - datetime.datetime.fromisoformat(started)
                        ).total_seconds()
                        if 0 <= age < 30:
                            live.append((port, pid, started))
                            continue
                    except (ValueError, TypeError):
                        pass
            os.remove(fpath)
        except (ValueError, TypeError, OSError):
            try:
                os.remove(fpath)
            except OSError:
                pass
    return live


def live_instances():
    """Return [(port, pid)] for all live instances (CLI-compat shape)."""
    return [(port, pid) for port, pid, _ in scan_live()]


def discover_instances(self_port=None, self_paths=None):
    """Instance rows for GET /api/instances.

    The caller passes its own open filepaths so the self row never
    round-trips over HTTP; siblings get a 1s serial probe each.
    """
    rows = []
    for port, pid, started in scan_live(assume_running=self_port):
        is_self = port == self_port
        paths = (self_paths or []) if is_self \
            else get_open_filepaths(port, timeout=1)
        rows.append({
            "port": port,
            "pid": pid,
            "started": started,
            "isSelf": is_self,
            "tabs": [{"filename": os.path.basename(p), "filepath": p}
                     for p in paths],
        })
    rows.sort(key=lambda r: (not r["isSelf"], r["port"]))
    return rows
