# Finder Integration (macOS)

Dabarat registers as a macOS file handler for `.md`, `.markdown`, `.mdown`, and `.mkd` files via an AppleScript droplet app.

## Build

```bash
cd macos && bash build.sh
```

This:
1. Resolves the real (non-shim) Python and dabarat binary paths
2. Writes `~/.dabarat/open-helper.py` with baked absolute paths
3. Compiles an AppleScript `on open` handler into `~/Applications/Dabarat.app`
4. Overlays `Info.plist` with UTI declarations (bundle ID: `com.minoanmystery.dabarat`)
5. Clears quarantine attributes
6. Registers with Launch Services via `lsregister`

## Set as Default Handler

**Option A -- CLI (recommended):**
```bash
brew install duti
duti -s com.minoanmystery.dabarat .md all
```

**Option B -- Finder:**
Right-click any `.md` file -> Get Info -> Open With -> Dabarat -> Change All...

## Test

```bash
open -a Dabarat README.md
```

## How It Works

The app is a two-layer architecture:

1. **AppleScript droplet** (`Dabarat.app/Contents/MacOS/droplet`) -- receives Apple Events from Finder (double-click, drag-and-drop, "Open With"), filters to markdown extensions, invokes the Python helper
2. **Python helper** (`~/.dabarat/open-helper.py`) -- checks if a dabarat server is running on port 3031; if so, POSTs files to `/api/add`; if not, spawns `dabarat` as a background process and waits for it to come up

## Rebuild After Python Upgrade

If you upgrade Python via pyenv (e.g., 3.13 -> 3.14), the baked paths in `open-helper.py` become stale. Re-run:

```bash
cd macos && bash build.sh
```

## Technical Notes

- `Info.plist` declares `CFBundleExecutable: droplet` (not `applet`) -- `osacompile` produces `droplet` for scripts with `on open` handlers
- `LSHandlerRank: Owner` gives highest priority for file association
- `LSItemContentTypes` includes `net.daringfireball.markdown` UTI for proper macOS type matching
- `UTImportedTypeDeclarations` imports the markdown UTI conforming to `public.plain-text`
