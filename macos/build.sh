#!/bin/bash
# Build Markdown Preview.app — a macOS app bundle that opens .md files in mark
# Installs to ~/Applications/ and registers with Launch Services

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="Markdown Preview"
APP_DIR="$HOME/Applications/${APP_NAME}.app"
BUNDLE_ID="com.minoanmystery.md-preview"

echo "Building ${APP_NAME}.app..."
echo "  Repo: $REPO_DIR"
echo "  Target: $APP_DIR"
echo ""

# Clean previous install
if [ -d "$APP_DIR" ]; then
    echo "  Removing existing app..."
    rm -rf "$APP_DIR"
fi

# Create bundle structure
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Copy Info.plist
cp "$SCRIPT_DIR/Info.plist" "$APP_DIR/Contents/"

# Generate executable with baked-in repo path
cat > "$APP_DIR/Contents/MacOS/md-preview" << EXEC
#!/bin/bash
# Markdown Preview — opens .md files in md_preview_and_annotate
# Built from: $REPO_DIR

TOOLSDIR="$REPO_DIR"
PYTHONPATH="\$TOOLSDIR" exec python3 -m md_preview_and_annotate "\$@"
EXEC

chmod +x "$APP_DIR/Contents/MacOS/md-preview"

# Register with Launch Services
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREGISTER" ]; then
    "$LSREGISTER" -f "$APP_DIR" 2>/dev/null || true
    echo "  Registered with Launch Services"
fi

echo ""
echo "\033[38;2;166;227;161m\u2713 ${APP_NAME}.app installed to ~/Applications/\033[0m"
echo ""
echo "Usage:"
echo "  Right-click any .md file → Open With → ${APP_NAME}"
echo "  open -a \"${APP_NAME}\" file.md"
echo ""
echo "To set as default .md handler:"
echo "  brew install duti"
echo "  duti -s ${BUNDLE_ID} .md all"
