#!/bin/bash
# Phase 4 verification — F9 fileMissing flag + save-recreates, F10 covered
# by client fetch-on-exit (behavioral, exercised via API contract here).
set -u

WORK="$(mktemp -d /tmp/dabarat-p4-XXXXXX)"
PORT=3781
PASS=0; FAIL=0
check(){ if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi; }

cleanup() {
  [ -n "${PID:-}" ] && kill -9 "$PID" 2>/dev/null
  rm -f ~/.dabarat/instances/${PORT}.pid ~/.dabarat/instances/${PORT}.tabs.json
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "# Ghost test" > "$WORK/ghost.md"

python3 -u -c "
import sys, webbrowser
import dabarat.__main__ as m
m._find_chrome = lambda: None
webbrowser.open = lambda *a, **k: True
sys.argv = ['dabarat', '$WORK/ghost.md', '--port', '$PORT']
m.cmd_serve(sys.argv)
" > "$WORK/server.log" 2>&1 &
PID=$!
for i in $(seq 1 20); do curl -s --max-time 1 http://127.0.0.1:$PORT/api/tabs >/dev/null 2>&1 && break; sleep 0.25; done

TAB=$(curl -s http://127.0.0.1:$PORT/api/tabs | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')

echo "── 1. Healthy file: no fileMissing flag"
curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert "fileMissing" not in d, d
print("  ✓ flag absent while file exists")'
check $? "no false positive"

echo "── 2. Delete file → fileMissing: true, cached content still served"
rm "$WORK/ghost.md"
curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d.get("fileMissing") is True, d
assert "# Ghost test" in d["content"], "cached content should survive"
print("  ✓ fileMissing reported, cache preserved")'
check $? "deleted file detected"

echo "── 3. Save recreates the file and clears the flag"
curl -s -X POST http://127.0.0.1:$PORT/api/save \
  -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:$PORT" \
  -d "{\"tab\": \"$TAB\", \"content\": \"# Recovered\"}" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d.get("ok"), d
print("  ✓ save succeeded")'
check $? "save-recreate works"
test -f "$WORK/ghost.md"; check $? "file back on disk"
curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert "fileMissing" not in d, d
assert "# Recovered" in d["content"], d["content"]
print("  ✓ flag cleared, recovered content served")'
check $? "ghost state clears after recreate"

kill -TERM $PID 2>/dev/null; sleep 1; PID=""
echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
