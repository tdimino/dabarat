"""HTTP server — serves the HTML shell and API endpoints."""

import datetime
import http.server
import json
import mimetypes
import os
import threading
import uuid
from urllib.parse import urlparse, parse_qs, unquote

from . import annotations
from . import bookmarks
from . import frontmatter
from . import history
from . import recent
from .template import get_html


class PreviewHandler(http.server.BaseHTTPRequestHandler):
    _tabs = {}
    _tabs_lock = threading.Lock()
    default_author = "Tom"
    _server_port = 3031

    def log_message(self, format, *args):
        pass

    @classmethod
    def add_tab(cls, filepath):
        tab_id = uuid.uuid4().hex[:8]
        try:
            with open(filepath) as f:
                content = f.read()
            mtime = os.path.getmtime(filepath)
        except Exception:
            content = ""
            mtime = 0
        with cls._tabs_lock:
            cls._tabs[tab_id] = {
                "filepath": filepath,
                "content": content,
                "mtime": mtime,
            }
        # Track in recent files
        try:
            recent.add_entry(filepath, content=content)
        except Exception:
            pass
        return tab_id

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        if length > 10 * 1024 * 1024:  # 10 MB cap
            self.rfile.read(length)  # drain
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, ValueError):
            return {}

    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode())

    def _check_origin(self):
        """Reject POST/PUT/DELETE from foreign origins (CSRF protection)."""
        if self.command in ("POST", "PUT", "DELETE"):
            origin = self.headers.get("Origin", "")
            if not origin:
                self._json_response({"error": "origin header required"}, 403)
                return False
            port = self._server_port
            allowed = {
                f"http://localhost:{port}",
                f"http://127.0.0.1:{port}",
            }
            if origin not in allowed:
                self._json_response({"error": "forbidden"}, 403)
                return False
        return True

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == "/api/content":
            tab_id = params.get("tab", [None])[0]
            if tab_id and tab_id in self._tabs:
                tab = self._tabs[tab_id]
                try:
                    mtime = os.path.getmtime(tab["filepath"])
                    if mtime != tab["mtime"]:
                        with open(tab["filepath"]) as f:
                            tab["content"] = f.read()
                        tab["mtime"] = mtime
                except Exception:
                    pass
                # Parse frontmatter — strip from content, return as separate field
                fm, body = frontmatter.get_frontmatter(tab["filepath"])
                self._json_response({
                    "content": body if fm else tab["content"],
                    "frontmatter": fm,
                    "mtime": tab["mtime"],
                })
            else:
                self._json_response({"error": "tab not found"}, 404)

        elif parsed.path == "/api/tabs":
            tabs_list = []
            for tid in self._tabs:
                tabs_list.append({
                    "id": tid,
                    "filename": os.path.basename(self._tabs[tid]["filepath"]),
                    "filepath": self._tabs[tid]["filepath"],
                })
            self._json_response(tabs_list)

        elif parsed.path == "/api/annotations":
            tab_id = params.get("tab", [None])[0]
            if tab_id and tab_id in self._tabs:
                filepath = self._tabs[tab_id]["filepath"]
                tab = self._tabs[tab_id]
                # Ensure we have fresh content for orphan detection
                try:
                    mtime_file = os.path.getmtime(tab["filepath"])
                    if mtime_file != tab["mtime"]:
                        with open(tab["filepath"]) as f:
                            tab["content"] = f.read()
                        tab["mtime"] = mtime_file
                except Exception:
                    pass
                # Auto-cleanup orphaned annotations
                annotations.cleanup_orphans(filepath, tab["content"])
                data, mtime = annotations.read(filepath)
                self._json_response({
                    "annotations": data.get("annotations", []),
                    "mtime": mtime,
                })
            else:
                self._json_response({"error": "tab not found"}, 404)

        elif parsed.path == "/api/tags":
            tab_id = params.get("tab", [None])[0]
            if tab_id and tab_id in self._tabs:
                filepath = self._tabs[tab_id]["filepath"]
                tags = annotations.read_tags(filepath)
                self._json_response({"tags": tags})
            else:
                self._json_response({"error": "tab not found"}, 404)

        elif parsed.path == "/api/recent":
            try:
                entries = recent.load()
                self._json_response({"entries": entries})
            except Exception as e:
                self._json_response({"entries": [], "error": str(e)})

        elif parsed.path == "/api/versions":
            tab_id = params.get("tab", [None])[0]
            if tab_id and tab_id in self._tabs:
                filepath = self._tabs[tab_id]["filepath"]
                try:
                    versions = history.list_versions(filepath)
                    self._json_response({"versions": versions})
                except Exception as e:
                    self._json_response({"versions": [], "error": str(e)})
            else:
                self._json_response({"error": "tab not found"}, 404)

        elif parsed.path == "/api/version":
            tab_id = params.get("tab", [None])[0]
            commit_hash = params.get("hash", [None])[0]
            if not tab_id or tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            if not commit_hash:
                self._json_response({"error": "hash required"}, 400)
                return
            filepath = self._tabs[tab_id]["filepath"]
            try:
                content = history.get_version_content(filepath, commit_hash)
                if content is not None:
                    self._json_response({"content": content})
                else:
                    self._json_response({"error": "version not found"}, 404)
            except ValueError as e:
                self._json_response({"error": str(e)}, 400)

        elif parsed.path == "/api/diff":
            tab_id = params.get("tab", [None])[0]
            against = params.get("against", [None])[0]
            if not tab_id or tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            if not against:
                self._json_response({"error": "against path required"}, 400)
                return
            # Resolve relative paths from the tab's directory
            against_path = against
            if not os.path.isabs(against_path):
                base_dir = os.path.dirname(self._tabs[tab_id]["filepath"])
                against_path = os.path.join(base_dir, against_path)
            against_path = os.path.abspath(against_path)
            # Restrict to markdown/text files in open tab directories
            _, ext = os.path.splitext(against_path)
            if ext.lower() not in {".md", ".markdown", ".txt", ".mdown", ".mkd"}:
                self._json_response({"error": "only markdown files allowed"}, 400)
                return
            tab_dirs = [os.path.dirname(t["filepath"]) for t in self._tabs.values()]
            if not any(against_path.startswith(d + os.sep) or against_path == os.path.join(d, os.path.basename(against_path)) for d in tab_dirs):
                self._json_response({"error": "path outside allowed directories"}, 403)
                return
            if not os.path.isfile(against_path):
                self._json_response({"error": "file not found: " + against_path}, 404)
                return
            tab = self._tabs[tab_id]
            left_content = tab["content"]
            try:
                with open(against_path, encoding="utf-8") as f:
                    right_content = f.read()
            except Exception as e:
                self._json_response({"error": str(e)}, 500)
                return
            from . import diff
            result = diff.prepare_diff(left_content, right_content)
            result["left_path"] = tab["filepath"]
            result["right_path"] = against_path
            result["left_filename"] = os.path.basename(tab["filepath"])
            result["right_filename"] = os.path.basename(against_path)
            self._json_response(result)

        elif parsed.path != "/" and parsed.path != "":
            # Try to serve static files relative to open tab directories
            rel_path = unquote(parsed.path.lstrip("/"))
            served = False
            for tab in self._tabs.values():
                tab_dir = os.path.dirname(tab["filepath"])
                candidate = os.path.normpath(os.path.join(tab_dir, rel_path))
                # Prevent directory traversal
                if not candidate.startswith(tab_dir + os.sep):
                    continue
                if os.path.isfile(candidate):
                    ctype, _ = mimetypes.guess_type(candidate)
                    if not ctype:
                        ctype = "application/octet-stream"
                    try:
                        with open(candidate, "rb") as f:
                            data = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", ctype)
                        self.send_header("Content-Length", str(len(data)))
                        self.send_header("Cache-Control", "public, max-age=60")
                        self.end_headers()
                        self.wfile.write(data)
                        served = True
                    except Exception:
                        pass
                    break
            if not served:
                # Fall through to HTML shell
                self._serve_html_shell()

        else:
            self._serve_html_shell()

    def _serve_html_shell(self):
        first_tab = next(iter(self._tabs), "")
        first_file = self._tabs[first_tab]["filepath"] if first_tab else ""
        title = os.path.basename(first_file) if first_file else "mdpreview"
        html = get_html(title=title, default_author=self.default_author)
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(html.encode())

    def do_POST(self):
        if not self._check_origin():
            return
        parsed = urlparse(self.path)
        body = self._read_body()

        if parsed.path == "/api/add":
            filepath = body.get("filepath", "")
            if not filepath:
                self._json_response({"error": "filepath required"}, 400)
                return
            if not os.path.isabs(filepath):
                first_tab = next(iter(self._tabs.values()), None)
                if first_tab:
                    base_dir = os.path.dirname(first_tab["filepath"])
                    filepath = os.path.join(base_dir, filepath)
            filepath = os.path.abspath(filepath)

            if not os.path.isfile(filepath):
                self._json_response({"error": f"file not found: {filepath}"}, 400)
                return

            # Check if already open
            for tid, tab in self._tabs.items():
                if tab["filepath"] == filepath:
                    self._json_response({
                        "id": tid,
                        "filename": os.path.basename(filepath),
                        "filepath": filepath,
                        "existing": True,
                    })
                    return

            tab_id = self.add_tab(filepath)
            self._json_response({
                "id": tab_id,
                "filename": os.path.basename(filepath),
                "filepath": filepath,
            })

        elif parsed.path == "/api/close":
            tab_id = body.get("id", "")
            with self._tabs_lock:
                if tab_id in self._tabs:
                    del self._tabs[tab_id]
                    self._json_response({"ok": True})
                else:
                    self._json_response({"error": "tab not found"}, 404)

        elif parsed.path == "/api/rename":
            tab_id = body.get("tab", "")
            new_name = body.get("name", "").strip()
            if tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            if not new_name:
                self._json_response({"error": "name required"}, 400)
                return
            if "/" in new_name or "\\" in new_name:
                self._json_response({"error": "name cannot contain path separators"}, 400)
                return
            if not new_name.endswith(".md"):
                new_name += ".md"

            old_path = self._tabs[tab_id]["filepath"]
            new_path = os.path.join(os.path.dirname(old_path), new_name)

            if new_path == old_path:
                self._json_response({"ok": True, "filepath": old_path, "filename": os.path.basename(old_path)})
                return
            if os.path.exists(new_path):
                self._json_response({"error": f"file already exists: {new_name}"}, 409)
                return

            try:
                os.rename(old_path, new_path)
                # Rename sidecar files
                for suffix in [".annotations.json", ".annotations.resolved.json"]:
                    old_sc = old_path + suffix
                    new_sc = new_path + suffix
                    if os.path.exists(old_sc):
                        os.rename(old_sc, new_sc)
                self._tabs[tab_id]["filepath"] = new_path
                self._json_response({"ok": True, "filepath": new_path, "filename": new_name})
            except OSError as e:
                self._json_response({"error": str(e)}, 500)

        elif parsed.path == "/api/browse":
            import platform
            import subprocess as sp
            if platform.system() != "Darwin":
                self._json_response({"error": "file browser only on macOS"}, 501)
                return
            script = (
                'set f to choose file of type {"md", "markdown", "txt"} '
                'with prompt "Choose a Markdown file"\n'
                'return POSIX path of f'
            )
            try:
                result = sp.run(
                    ["osascript", "-e", script],
                    capture_output=True, text=True, timeout=60,
                )
                if result.returncode == 0 and result.stdout.strip():
                    self._json_response({"filepath": result.stdout.strip()})
                else:
                    self._json_response({"cancelled": True})
            except Exception:
                self._json_response({"cancelled": True})

        elif parsed.path == "/api/annotate":
            tab_id = body.get("tab", "")
            if tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            filepath = self._tabs[tab_id]["filepath"]
            data, _ = annotations.read(filepath)

            ann = {
                "id": uuid.uuid4().hex[:6],
                "anchor": body.get("anchor", {}),
                "author": body.get("author", {}),
                "created": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "body": body.get("body", ""),
                "type": body.get("type", "comment"),
                "resolved": False,
                "replies": [],
            }
            data["annotations"].append(ann)
            annotations.write(filepath, data)

            # Save bookmarks to global ~/.claude/bookmarks/
            if ann["type"] == "bookmark":
                try:
                    anchor = ann.get("anchor", {})
                    author = ann.get("author", {})
                    bookmarks.save(
                        anchor_text=anchor.get("text", ""),
                        body=ann.get("body", ""),
                        author=author.get("name", "Unknown"),
                        source_file=filepath,
                        ann_id=ann["id"],
                        heading=anchor.get("heading", ""),
                    )
                except Exception:
                    pass  # Don't fail the annotation if bookmark save fails

            self._json_response({"ok": True, "id": ann["id"]})

        elif parsed.path == "/api/resolve":
            tab_id = body.get("tab", "")
            ann_id = body.get("id", "")
            if tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            filepath = self._tabs[tab_id]["filepath"]
            data, _ = annotations.read(filepath)
            target = None
            for ann in data["annotations"]:
                if ann["id"] == ann_id:
                    target = ann
                    break

            if target:
                was_resolved = target.get("resolved", False)
                if not was_resolved:
                    # Resolve: mark resolved, add timestamp, archive it
                    target["resolved"] = True
                    target["resolved_at"] = datetime.datetime.now(
                        datetime.timezone.utc
                    ).isoformat()
                    # Move to resolved archive
                    archive = annotations.read_resolved(filepath)
                    archive["resolved"].append(target)
                    annotations.write_resolved(filepath, archive)
                    # Remove from active annotations
                    data["annotations"] = [
                        a for a in data["annotations"] if a["id"] != ann_id
                    ]
                else:
                    # Unresolve: toggle back
                    target["resolved"] = False
                    target.pop("resolved_at", None)

            annotations.write(filepath, data)
            self._json_response({"ok": True})

        elif parsed.path == "/api/reply":
            tab_id = body.get("tab", "")
            ann_id = body.get("id", "")
            if tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            filepath = self._tabs[tab_id]["filepath"]
            data, _ = annotations.read(filepath)
            for ann in data["annotations"]:
                if ann["id"] == ann_id:
                    reply = {
                        "author": body.get("author", {}),
                        "created": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "body": body.get("body", ""),
                    }
                    ann.setdefault("replies", []).append(reply)
                    break
            annotations.write(filepath, data)
            self._json_response({"ok": True})

        elif parsed.path == "/api/delete-annotation":
            tab_id = body.get("tab", "")
            ann_id = body.get("id", "")
            if tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            filepath = self._tabs[tab_id]["filepath"]
            data, _ = annotations.read(filepath)
            data["annotations"] = [a for a in data["annotations"] if a["id"] != ann_id]
            annotations.write(filepath, data)
            self._json_response({"ok": True})

        elif parsed.path == "/api/save":
            tab_id = body.get("tab", "")
            content = body.get("content")
            if tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            if content is None:
                self._json_response({"error": "content required"}, 400)
                return
            if len(content) > 10 * 1024 * 1024:  # 10 MB limit
                self._json_response({"error": "content too large"}, 413)
                return
            filepath = self._tabs[tab_id]["filepath"]
            try:
                import tempfile
                dir_name = os.path.dirname(filepath)
                fd, tmp_path = tempfile.mkstemp(
                    dir=dir_name, suffix=".tmp", prefix=".mdpreview-"
                )
                try:
                    os.write(fd, content.encode("utf-8"))
                finally:
                    os.close(fd)
                os.replace(tmp_path, filepath)
                mtime = os.path.getmtime(filepath)
                self._tabs[tab_id]["content"] = content
                self._tabs[tab_id]["mtime"] = mtime
                # Auto-commit to version history
                version_hash = ""
                try:
                    version_hash = history.commit(filepath)
                except Exception:
                    pass
                self._json_response({"ok": True, "mtime": mtime, "version": version_hash})
            except Exception as e:
                self._json_response({"error": str(e)}, 500)

        elif parsed.path == "/api/restore":
            tab_id = body.get("tab", "")
            commit_hash = body.get("hash", "")
            if tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            if not commit_hash:
                self._json_response({"error": "hash required"}, 400)
                return
            filepath = self._tabs[tab_id]["filepath"]
            try:
                content = history.restore(filepath, commit_hash)
                if content is not None:
                    mtime = os.path.getmtime(filepath)
                    self._tabs[tab_id]["content"] = content
                    self._tabs[tab_id]["mtime"] = mtime
                    self._json_response({"ok": True, "content": content, "mtime": mtime})
                else:
                    self._json_response({"error": "version not found"}, 404)
            except ValueError as e:
                self._json_response({"error": str(e)}, 400)
            except Exception as e:
                self._json_response({"error": str(e)}, 500)

        elif parsed.path == "/api/tags":
            tab_id = body.get("tab", "")
            tag = body.get("tag", "").strip()
            action = body.get("action", "add")
            if tab_id not in self._tabs:
                self._json_response({"error": "tab not found"}, 404)
                return
            if not tag:
                self._json_response({"error": "tag required"}, 400)
                return
            filepath = self._tabs[tab_id]["filepath"]
            if action == "remove":
                tags = annotations.remove_tag(filepath, tag)
            else:
                tags = annotations.add_tag(filepath, tag)
            self._json_response({"ok": True, "tags": tags})

        else:
            self.send_error(404)


def start(port, handler_class=PreviewHandler):
    """Create and return a ThreadingHTTPServer bound to localhost:port."""
    handler_class._server_port = port
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler_class)
