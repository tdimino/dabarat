"""Side-by-side diff computation for markdown files (stdlib only)."""

import difflib
import re

# Reuse frontmatter extraction regex from frontmatter module
_FM_RE = re.compile(r'\A\ufeff?---[ \t]*\r?\n(.*?\r?\n)---[ \t]*\r?\n', re.DOTALL)


def _strip_frontmatter(content):
    """Strip YAML frontmatter, return (fm_text, body).

    Returns ('', content) if no frontmatter found.
    """
    m = _FM_RE.match(content)
    if not m:
        return '', content
    return m.group(1), content[m.end():]


def compute_side_by_side(left_lines, right_lines):
    """Compute paired side-by-side diff arrays.

    Returns dict with:
      left  — list of {line: str, type: 'equal'|'delete'|'change'|'empty'}
      right — list of {line: str, type: 'equal'|'insert'|'change'|'empty'}
      stats — {added: int, removed: int, changed: int}

    Paired by index: left[i] corresponds to right[i].
    'empty' entries are padding to keep sides aligned.
    """
    sm = difflib.SequenceMatcher(None, left_lines, right_lines, autojunk=False)
    left_out = []
    right_out = []
    added = removed = changed = 0

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                left_out.append({'line': left_lines[i1 + k], 'type': 'equal'})
                right_out.append({'line': right_lines[j1 + k], 'type': 'equal'})

        elif tag == 'delete':
            for k in range(i2 - i1):
                left_out.append({'line': left_lines[i1 + k], 'type': 'delete'})
                right_out.append({'line': '', 'type': 'empty'})
            removed += i2 - i1

        elif tag == 'insert':
            for k in range(j2 - j1):
                left_out.append({'line': '', 'type': 'empty'})
                right_out.append({'line': right_lines[j1 + k], 'type': 'insert'})
            added += j2 - j1

        elif tag == 'replace':
            left_count = i2 - i1
            right_count = j2 - j1
            pairs = min(left_count, right_count)

            # Paired changed lines
            for k in range(pairs):
                left_out.append({'line': left_lines[i1 + k], 'type': 'change'})
                right_out.append({'line': right_lines[j1 + k], 'type': 'change'})

            # Leftover on left side (deletions)
            for k in range(pairs, left_count):
                left_out.append({'line': left_lines[i1 + k], 'type': 'delete'})
                right_out.append({'line': '', 'type': 'empty'})

            # Leftover on right side (insertions)
            for k in range(pairs, right_count):
                left_out.append({'line': '', 'type': 'empty'})
                right_out.append({'line': right_lines[j1 + k], 'type': 'insert'})

            changed += pairs
            removed += max(0, left_count - pairs)
            added += max(0, right_count - pairs)

    return {
        'left': left_out,
        'right': right_out,
        'stats': {'added': added, 'removed': removed, 'changed': changed},
    }


def prepare_diff(left_content, right_content):
    """Prepare a frontmatter-aware side-by-side diff.

    Returns dict with:
      body       — compute_side_by_side result for markdown bodies
      fm_left    — raw frontmatter text (or '')
      fm_right   — raw frontmatter text (or '')
      fm_changed — bool
    """
    fm_left, body_left = _strip_frontmatter(left_content)
    fm_right, body_right = _strip_frontmatter(right_content)

    left_lines = body_left.splitlines(keepends=True)
    right_lines = body_right.splitlines(keepends=True)

    body_diff = compute_side_by_side(left_lines, right_lines)

    return {
        'body': body_diff,
        'fm_left': fm_left,
        'fm_right': fm_right,
        'fm_changed': fm_left != fm_right,
    }
