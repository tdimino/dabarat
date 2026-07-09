#!/bin/bash
# Phase 5 verification — F4 edit-mode conflict detection:
# /api/mtime probe + /api/save baseChangeKey → 409 → force overwrite.
set -u

WORK="$(mktemp -d /tmp/dabarat-p5-XXXXXX)"
PORT=3782
PASS=0; FAIL=0
check(){ if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi; }

cleanup() {
  [ -n "${PID:-}" ] && kill -9 "$PID" 2>/dev/null
  rm -f ~/.dabarat/instances/${PORT}.pid ~/.dabarat/instances/${PORT}.tabs.json
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "# Conflict test" > "$WORK/conflict.md"

python3 -u -c "
import sys, webbrowser
import dabarat.__main__ as m
m._find_chrome = lambda: None
webbrowser.open = lambda *a, **k: True
sys.argv = ['dabarat', '$WORK/conflict.md', '--port', '$PORT']
m.cmd_serve(sys.argv)
" > "$WORK/server.log" 2>&1 &
PID=$!
for i in $(seq 1 20); do curl -s --max-time 1 http://127.0.0.1:$PORT/api/tabs >/dev/null 2>&1 && break; sleep 0.25; done

TAB=$(curl -s http://127.0.0.1:$PORT/api/tabs | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')
BASE="http://127.0.0.1:$PORT"

echo "── 1. /api/mtime returns changeKey without reading content"
K0=$(curl -s "$BASE/api/mtime?tab=$TAB" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert ":" in d["changeKey"] and d["fileMissing"] is False, d
print(d["changeKey"])')
check $? "mtime probe OK ($K0)"

echo "── 2. /api/mtime reflects deletion"
mv "$WORK/conflict.md" "$WORK/conflict.md.bak"
curl -s "$BASE/api/mtime?tab=$TAB" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d["fileMissing"] is True, d
print("  ✓ fileMissing on moved file")'
check $? "probe detects missing file"
mv "$WORK/conflict.md.bak" "$WORK/conflict.md"

echo "── 3. Stale baseChangeKey → 409 with currentChangeKey"
KEY=$(curl -s "$BASE/api/content?tab=$TAB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["changeKey"])')
sleep 0.05
echo "# Externally modified" > "$WORK/conflict.md"
CODE=$(curl -s -o "$WORK/409.json" -w "%{http_code}" -X POST "$BASE/api/save" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  -d "{\"tab\": \"$TAB\", \"content\": \"# My edit\", \"baseChangeKey\": \"$KEY\"}")
[ "$CODE" = "409" ]; check $? "got 409 (got $CODE)"
python3 -c '
import json
d=json.load(open("'$WORK'/409.json"))
assert d["error"] == "conflict" and ":" in d.get("currentChangeKey",""), d
print("  ✓ conflict body:", d["message"])'
check $? "409 payload correct"
grep -q "Externally modified" "$WORK/conflict.md"; check $? "disk content NOT clobbered"

echo "── 4. Matching baseChangeKey → save succeeds"
KEY2=$(curl -s "$BASE/api/content?tab=$TAB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["changeKey"])')
curl -s -X POST "$BASE/api/save" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  -d "{\"tab\": \"$TAB\", \"content\": \"# Clean save\", \"baseChangeKey\": \"$KEY2\"}" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d.get("ok"), d
print("  ✓ save ok, new changeKey:", d["changeKey"])'
check $? "fresh-key save accepted"

echo "── 5. Force save (no baseChangeKey) always succeeds"
echo "# Another external change" > "$WORK/conflict.md"
curl -s -X POST "$BASE/api/save" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  -d "{\"tab\": \"$TAB\", \"content\": \"# Forced\"}" | python3 -c '
import json,sys; d=json.load(sys.stdin); assert d.get("ok"), d; print("  ✓ force save ok")'
check $? "force overwrite path works"
grep -q "Forced" "$WORK/conflict.md"; check $? "forced content on disk"

kill -TERM $PID 2>/dev/null; sleep 1; PID=""
echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
