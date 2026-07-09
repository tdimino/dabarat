#!/bin/bash
# Phase 3 verification — F2 frontmatter preserved through editor save,
# F3 frontmatter-only edits produce a new changeKey + body/content split.
set -u

WORK="$(mktemp -d /tmp/dabarat-p3-XXXXXX)"
PORT=3779
PASS=0; FAIL=0
check(){ if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi; }

cleanup() {
  [ -n "${PID:-}" ] && kill -9 "$PID" 2>/dev/null
  rm -f ~/.dabarat/instances/${PORT}.pid ~/.dabarat/instances/${PORT}.tabs.json
  rm -rf "$WORK"
}
trap cleanup EXIT

cat > "$WORK/fm.md" << 'EOF'
---
title: Test Document
version: 1
type: prompt
---

# Hello World

Body content here.
EOF

python3 -u -c "
import sys, webbrowser
import dabarat.__main__ as m
m._find_chrome = lambda: None
webbrowser.open = lambda *a, **k: True
sys.argv = ['dabarat', '$WORK/fm.md', '--port', '$PORT']
m.cmd_serve(sys.argv)
" > "$WORK/server.log" 2>&1 &
PID=$!
for i in $(seq 1 20); do curl -s --max-time 1 http://127.0.0.1:$PORT/api/tabs >/dev/null 2>&1 && break; sleep 0.25; done

TAB=$(curl -s http://127.0.0.1:$PORT/api/tabs | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')

echo "── 1. F2: /api/content returns raw content + stripped body"
curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d["content"].startswith("---"), "content must be raw (include frontmatter)"
assert "body" in d and not d["body"].startswith("---"), "body must be stripped"
assert d["frontmatter"].get("title") == "Test Document", d["frontmatter"]
print("  ✓ raw content + stripped body + parsed frontmatter")'
check $? "content/body split correct"

echo "── 2. F2: editor save round-trip preserves frontmatter"
# Simulate the client editor exactly: savedContent = raw content; the editor
# stashes fm via _stripFrontmatter and prepends it on save.
node - "$PORT" "$TAB" << 'JS'
const [port, tab] = process.argv.slice(2);
let _stashedFrontmatter = '';
function _stripFrontmatter(md) {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (match) { _stashedFrontmatter = match[0]; return md.slice(match[0].length); }
  _stashedFrontmatter = ''; return md;
}
(async () => {
  const base = `http://127.0.0.1:${port}`;
  const data = await (await fetch(`${base}/api/content?tab=${tab}`)).json();
  const body = _stripFrontmatter(data.content);       // enterEditMode
  if (!_stashedFrontmatter) { console.error("stash empty — F2 regression"); process.exit(1); }
  const edited = body.replace('Body content here.', 'Edited body.');
  const content = _stashedFrontmatter + edited;        // _prependFrontmatter on save
  const res = await fetch(`${base}/api/save`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Origin': base},
    body: JSON.stringify({ tab, content })
  });
  const out = await res.json();
  if (!out.ok) { console.error("save failed", out); process.exit(1); }
  process.exit(0);
})();
JS
check $? "simulated editor save succeeded"

python3 -c '
content = open("'$WORK'/fm.md").read()
assert content.startswith("---"), f"FRONTMATTER LOST: {content[:40]!r}"
assert "title: Test Document" in content, "fm field lost"
assert "Edited body." in content, "edit lost"
print("  ✓ on-disk file retains frontmatter + edit")'
check $? "frontmatter survived the save"

echo "── 3. F3: frontmatter-only edit rotates changeKey (body unchanged)"
K1=$(curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["changeKey"])')
python3 - << PY
content = open("$WORK/fm.md").read()
open("$WORK/fm.md", "w").write(content.replace("version: 1", "version: 2"))
PY
RESP=$(curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB")
K2=$(echo "$RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["changeKey"])')
[ "$K1" != "$K2" ]; check $? "changeKey rotated ($K1 → $K2)"
echo "$RESP" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d["frontmatter"]["version"] == 2, d["frontmatter"]
print("  ✓ updated frontmatter served")'
check $? "new frontmatter visible to client"

echo "── 4. No-frontmatter file: no body field, content raw"
echo "# Plain" > "$WORK/plain.md"
ADD=$(curl -s -X POST http://127.0.0.1:$PORT/api/add \
  -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:$PORT" \
  -d "{\"filepath\": \"$WORK/plain.md\"}")
TAB2=$(echo "$ADD" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB2" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert "body" not in d, "body should be absent without fm"
assert d["content"].startswith("# Plain"), d["content"][:20]
print("  ✓ plain file untouched by split")'
check $? "plain files unaffected"

kill -TERM $PID 2>/dev/null; sleep 1; PID=""
echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
