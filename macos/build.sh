#!/bin/bash
# Build Dabarat.app — an AppleScript droplet that opens .md files in Dabarat
# Handles Finder double-click, drag-and-drop, and "Open With" via Apple Events
# Installs to ~/Applications/ and registers with Launch Services
#
# Usage: bash macos/build.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="Dabarat"
APP_DIR="$HOME/Applications/${APP_NAME}.app"
BUNDLE_ID="com.minoanmystery.dabarat"

# ── Python discovery: find the real (non-shim) Python + dabarat binary
# LaunchServices strips PATH — pyenv shims won't work, we need absolute paths
PYTHON_PATH=""
DABARAT_PATH=""

# Strategy 1: pyenv versions (most likely for dev install)
for pyenv_bin in "$HOME/.pyenv/versions"/*/bin; do
    candidate="$pyenv_bin/dabarat"
    if [ -x "$candidate" ]; then
        DABARAT_PATH="$candidate"
        PYTHON_PATH="$(readlink -f "$pyenv_bin/python3" 2>/dev/null || echo "$pyenv_bin/python3")"
        break
    fi
done

# Strategy 2: Homebrew locations
if [ -z "$DABARAT_PATH" ]; then
    for loc in /opt/homebrew/bin /usr/local/bin; do
        if [ -x "$loc/dabarat" ]; then
            DABARAT_PATH="$loc/dabarat"
            PYTHON_PATH=$(head -1 "$DABARAT_PATH" | sed 's|^#!||')
            break
        fi
    done
fi

if [ -z "$DABARAT_PATH" ]; then
    echo "ERROR: dabarat not found. Run: pip install -e . from the repo root"
    exit 1
fi

echo "Building ${APP_NAME}.app..."
echo "  Repo:    $REPO_DIR"
echo "  Python:  $PYTHON_PATH"
echo "  Dabarat: $DABARAT_PATH"
echo "  Target:  $APP_DIR"
echo ""

# ── Clean previous install
if [ -d "$APP_DIR" ]; then
    echo "  Removing existing app..."
    rm -rf "$APP_DIR"
fi
mkdir -p "$HOME/Applications"

# ── Step 1: Write the Python open-helper
HELPER_DIR="$HOME/.dabarat"
mkdir -p "$HELPER_DIR"
HELPER="$HELPER_DIR/open-helper.py"

cat > "$HELPER" << HELPER_PY
#!/usr/bin/env python3
"""Dabarat open helper — invoked by Dabarat.app on file open events.

Adds files to a running dabarat server, or starts a new server instance.
Baked paths (set at build time by macos/build.sh):
  PYTHON  = ${PYTHON_PATH}
  DABARAT = ${DABARAT_PATH}
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

PORT = 3031
PYTHON = "${PYTHON_PATH}"
DABARAT = "${DABARAT_PATH}"


def _show_error(msg):
    script = f'display dialog "{msg}" with title "Dabarat" buttons {{"OK"}} default button "OK" with icon stop'
    try:
        subprocess.run(["osascript", "-e", script], timeout=10)
    except Exception:
        pass


def _server_running():
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{PORT}/api/tabs")
        urllib.request.urlopen(req, timeout=1)
        return True
    except Exception:
        return False


def _add_to_server(filepath):
    try:
        data = json.dumps({"filepath": filepath}).encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{PORT}/api/add",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Origin": f"http://127.0.0.1:{PORT}",
            },
        )
        urllib.request.urlopen(req, timeout=3)
        return True
    except Exception:
        return False


def main():
    files = [os.path.abspath(a) for a in sys.argv[1:]]
    if not files:
        sys.exit(0)

    if not os.path.isfile(DABARAT):
        _show_error(
            "Dabarat is not installed.\\n\\n"
            "Run: pip install -e . from the dabarat repo,\\n"
            "then re-run: bash macos/build.sh"
        )
        sys.exit(1)

    if _server_running():
        for f in files:
            _add_to_server(f)
    else:
        env = os.environ.copy()
        env["PATH"] = os.path.dirname(PYTHON) + ":" + env.get("PATH", "")
        try:
            subprocess.Popen(
                [DABARAT] + files,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as exc:
            _show_error(f"Failed to start Dabarat:\\n{exc}")
            sys.exit(1)

        # Wait up to 10s for server to come up
        for _ in range(40):
            time.sleep(0.25)
            if _server_running():
                break


if __name__ == "__main__":
    main()
HELPER_PY
chmod +x "$HELPER"
echo "  Helper written: $HELPER"

# ── Step 2: Write the AppleScript source
# "on open" handler makes osacompile produce a "droplet" binary
APPLET_SRC=$(mktemp /tmp/dabarat-XXXXX.applescript)
cat > "$APPLET_SRC" << 'APPLESCRIPT'
-- Dabarat.app — opens .md files in the Dabarat markdown previewer
-- Receives files from Finder double-click, drag-and-drop, and "Open With"

on open theFiles
    set filePaths to {}
    repeat with f in theFiles
        set p to POSIX path of f
        if p ends with ".md" or p ends with ".markdown" or p ends with ".mdown" or p ends with ".mkd" then
            set end of filePaths to p
        end if
    end repeat

    if (count of filePaths) is 0 then return

    set argStr to ""
    repeat with p in filePaths
        set argStr to argStr & " " & quoted form of p
    end repeat

    set helperPath to POSIX path of (path to home folder) & ".dabarat/open-helper.py"

    try
        do shell script helperPath & argStr & " > /dev/null 2>&1 &"
    on error errMsg
        display dialog "Dabarat could not open the file(s)." & return & return & errMsg ¬
            with title "Dabarat" buttons {"OK"} default button "OK" with icon stop
    end try
end open

on run
    display dialog "Dabarat opens Markdown files." & return & return & ¬
        "Double-click a .md file, or drag files onto this app icon." ¬
        with title "Dabarat" buttons {"OK"} default button "OK"
end run
APPLESCRIPT

# ── Step 3: Compile into .app bundle
echo "  Compiling AppleScript droplet..."
osacompile -o "$APP_DIR" "$APPLET_SRC"
rm -f "$APPLET_SRC"

# Verify osacompile produced "droplet" (matches Info.plist CFBundleExecutable)
BINARY_NAME=$(ls "$APP_DIR/Contents/MacOS/" 2>/dev/null | head -1)
if [ "$BINARY_NAME" != "droplet" ]; then
    echo "  WARNING: Expected binary 'droplet', found '$BINARY_NAME'"
fi

# ── Step 4: Overlay our Info.plist (osacompile generates a generic one)
cp "$SCRIPT_DIR/Info.plist" "$APP_DIR/Contents/"
echo "  Info.plist installed (Owner rank, net.daringfireball.markdown UTI)"

# ── Step 5: Clear quarantine attribute (prevents Gatekeeper "unidentified developer" dialog)
xattr -cr "$APP_DIR" 2>/dev/null || true

# ── Step 6: Register with Launch Services
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREGISTER" ]; then
    "$LSREGISTER" -f "$APP_DIR" 2>/dev/null || true
    echo "  Registered with Launch Services"
fi

echo ""
echo -e "\033[38;2;166;227;161m✓ ${APP_NAME}.app installed to ~/Applications/\033[0m"
echo ""
echo "To set as default .md handler:"
echo ""
echo "  Option A — CLI (requires duti):"
echo "    brew install duti"
echo "    duti -s ${BUNDLE_ID} .md all"
echo ""
echo "  Option B — Finder:"
echo "    Right-click any .md file → Get Info → Open With →"
echo "    Select '${APP_NAME}' → click 'Change All...'"
echo ""
echo "Test:"
echo "  open -a '${APP_NAME}' README.md"
