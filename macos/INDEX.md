# macOS Integration

Finder integration files for registering as a `.md` file handler.

| File | Description |
|------|-------------|
| `build.sh` | Build script that creates `Markdown Preview.app` in `~/Applications/` and registers with Launch Services |
| `Info.plist` | App bundle metadata — declares `.md`/`.markdown` UTI handlers, bundle ID `com.minoanmystery.md-preview` |

## Usage

```bash
cd macos && bash build.sh
open -a "Markdown Preview" document.md
```
