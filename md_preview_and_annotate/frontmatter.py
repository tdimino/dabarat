"""YAML frontmatter parser — stdlib only, no pyyaml dependency.

Extracts YAML frontmatter from markdown files and parses a subset of YAML
(scalars, inline lists, block lists, list-of-dicts) sufficient for .prompt.md
metadata. Falls back to pyyaml if installed.

Caches parsed frontmatter keyed on (filepath, mtime) so polling doesn't re-parse.
"""

import os
import re

# Match frontmatter delimited by --- at the very start of the file.
# Handles optional UTF-8 BOM (\ufeff in decoded str) and CRLF line endings.
FM_RE = re.compile(
    r'\A\ufeff?---[ \t]*\r?\n(.*?\r?\n)---[ \t]*\r?\n',
    re.DOTALL,
)

# Cache: (filepath, mtime) → (frontmatter_dict, body_str)
_fm_cache: dict = {}


def _coerce(val: str):
    """Coerce a YAML scalar string to int/float/bool/None or stripped string."""
    stripped = val.strip()
    low = stripped.lower()
    if low in ('true', 'yes'):
        return True
    if low in ('false', 'no'):
        return False
    if low in ('null', '~', ''):
        return None
    # Remove surrounding quotes
    if len(stripped) >= 2 and stripped[0] in ('"', "'") and stripped[-1] == stripped[0]:
        return stripped[1:-1]
    for typ in (int, float):
        try:
            return typ(stripped)
        except ValueError:
            pass
    return stripped


def _parse_inline_dict(s: str) -> dict:
    """Parse 'key: value' from a single line into a dict entry."""
    d = {}
    k, _, v = s.partition(':')
    if k.strip():
        d[k.strip()] = _coerce(v.strip())
    return d


def parse_yaml_subset(raw: str) -> dict:
    """Parse flat YAML with strings, numbers, bools, inline lists, block lists,
    and list-of-dicts. Sufficient for .prompt.md frontmatter."""
    result = {}
    lines = raw.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        # Skip blanks and comments
        if not line.strip() or line.strip().startswith('#'):
            i += 1
            continue
        m = re.match(r'^(\w[\w\s]*?):\s*(.*)', line)
        if not m:
            i += 1
            continue
        key = m.group(1).strip()
        val = m.group(2).strip()

        if val.startswith('[') and val.endswith(']'):
            # Inline list: [a, b, c]
            result[key] = [v.strip().strip('"\'') for v in val[1:-1].split(',') if v.strip()]
        elif val == '' or val == '|':
            # Block list or literal block scalar
            is_literal = (val == '|')
            items = []
            literal_lines = []
            i += 1
            while i < len(lines) and (lines[i].startswith('  ') or lines[i].strip() == ''):
                sub = lines[i]
                if is_literal and not sub.strip().startswith('- '):
                    literal_lines.append(sub[2:] if sub.startswith('  ') else sub)
                    i += 1
                    continue
                sub = sub.strip()
                if not sub:
                    i += 1
                    continue
                if sub.startswith('- '):
                    item_val = sub[2:].strip()
                    if ':' in item_val:
                        # list-of-dicts: first key on same line as -
                        d = _parse_inline_dict(item_val)
                        i += 1
                        while i < len(lines) and re.match(r'^    \w', lines[i]):
                            k2, _, v2 = lines[i].strip().partition(':')
                            d[k2.strip()] = _coerce(v2.strip())
                            i += 1
                        items.append(d)
                        continue
                    items.append(_coerce(item_val))
                else:
                    items.append(sub)
                i += 1
            if is_literal and literal_lines:
                result[key] = '\n'.join(literal_lines).rstrip('\n')
            elif items:
                result[key] = items
            else:
                result[key] = None
            continue
        else:
            result[key] = _coerce(val)
        i += 1
    return result


# Try pyyaml first, fall back to our subset parser
try:
    import yaml

    def _parse(raw: str) -> dict:
        return yaml.safe_load(raw) or {}
except ImportError:
    _parse = parse_yaml_subset


def get_frontmatter(filepath: str) -> tuple:
    """Parse frontmatter from a file. Returns (frontmatter_dict, body_string).

    Body has frontmatter stripped. Results are cached by (filepath, mtime).
    Returns ({}, full_content) if no frontmatter found.
    """
    try:
        mtime = os.path.getmtime(filepath)
    except OSError:
        return {}, ""

    key = (filepath, mtime)
    if key in _fm_cache:
        return _fm_cache[key]

    try:
        with open(filepath, encoding='utf-8') as f:
            raw = f.read()
    except (OSError, UnicodeDecodeError):
        return {}, ""

    m = FM_RE.match(raw)
    if not m:
        result = ({}, raw)
        _fm_cache[key] = result
        return result

    try:
        fm = _parse(m.group(1))
    except Exception:
        fm = {}

    body = raw[m.end():]
    result = (fm, body)
    _fm_cache[key] = result
    return result
