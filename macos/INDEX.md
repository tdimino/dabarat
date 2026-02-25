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
