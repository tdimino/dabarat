# macOS Integration

Finder integration files for registering as a `.md` file handler.

| File | Description |
|------|-------------|
| `build.sh` | Build script that creates `Dabarat.app` in `~/Applications/` and registers with Launch Services |
| `Info.plist` | App bundle metadata — declares `.md`/`.markdown` UTI handlers, bundle ID `com.minoanmystery.dabarat` |

## Usage

```bash
cd macos && bash build.sh
open -a "Dabarat" document.md
```

## Build pipeline

1. **Discovery** — finds the `dabarat` entry point in `~/.pyenv/versions/*/bin/` or Homebrew
2. **Helper** — writes `~/.dabarat/open-helper.py` with baked-in absolute Python and `dabarat` paths (LaunchServices strips `PATH`, so shim lookups fail)
3. **Droplet** — compiles an AppleScript `on open` handler into `~/Applications/Dabarat.app` via `osacompile`
4. **Info.plist overlay** — replaces the generic one `osacompile` generates with ours (declares `.md` UTI at Owner rank)
5. **Re-sign** — `codesign --force --deep --sign -` re-applies an ad-hoc signature *after* the Info.plist overlay. Required on macOS 15+: an unbound Info.plist makes the droplet hang silently on `do shell script` under TCC
6. **Launch Services** — `lsregister -f` registers the bundle

## Runtime flow (Finder → browser)

```
Finder "Open With → Dabarat"
  → Apple Event to droplet
  → AppleScript `on open theFiles`
  → `do shell script "nohup open-helper.py ... &"`
  → POST /api/add to running server (or spawn one)
  → _surface_browser(url)
       ├─ Chromium --app=URL  (standalone chromeless window)
       └─ /usr/bin/open URL   (fallback: default browser)
```

`_surface_browser` prefers a Chromium-family binary (Chrome, Brave, Edge, Vivaldi, Chromium) so the file opens in a **standalone app-mode window** — no tab bar, no URL bar. Arc is skipped because it ignores `--app=`. Falls back to `/usr/bin/open URL` (Launch Services, default browser, regular tab) when no Chromium browser is installed. Neither path triggers the macOS 15 Automation TCC prompt that `osascript tell application "Chrome"` does.
