#!/bin/bash
# Phase 2 verification — F5 thread safety, F6 changeKey, F8 SIGTERM handler.
# Headless (no browser, no dialogs), scratch port only.
set -u

WORK="$(mktemp -d /tmp/dabarat-p2-XXXXXX)"
PORT=3778
PASS=0; FAIL=0
check(){ if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi; }

cleanup() {
  [ -n "${PID:-}" ] && kill -9 "$PID" 2>/dev/null
  rm -f ~/.dabarat/instances/${PORT}.pid ~/.dabarat/instances/${PORT}.tabs.json
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "# Stress doc" > "$WORK/doc.md"

python3 -u -c "
import sys, webbrowser
import dabarat.__main__ as m
m._find_chrome = lambda: None
webbrowser.open = lambda *a, **k: True
sys.argv = ['dabarat', '$WORK/doc.md', '--port', '$PORT']
m.cmd_serve(sys.argv)
" > "$WORK/server.log" 2>&1 &
PID=$!
for i in $(seq 1 20); do curl -s --max-time 1 http://127.0.0.1:$PORT/api/tabs >/dev/null 2>&1 && break; sleep 0.25; done

TAB=$(curl -s http://127.0.0.1:$PORT/api/tabs | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')

echo "── 1. F6: changeKey in /api/content and /api/save"
curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert "changeKey" in d and ":" in d["changeKey"], d.get("changeKey")
print("  ✓ content changeKey:", d["changeKey"])'
check $? "changeKey present in content response"

SAVE=$(curl -s -X POST http://127.0.0.1:$PORT/api/save \
  -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:$PORT" \
  -d "{\"tab\": \"$TAB\", \"content\": \"# Stress doc v2\"}")
echo "$SAVE" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d.get("ok") and "changeKey" in d, d
print("  ✓ save returns changeKey:", d["changeKey"])'
check $? "changeKey present in save response"

echo "── 2. F6: sub-second rewrite detected (ns+size key changes)"
K1=$(curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["changeKey"])')
printf '# Stress doc v3 (different size)\n' > "$WORK/doc.md"
K2=$(curl -s "http://127.0.0.1:$PORT/api/content?tab=$TAB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["changeKey"])')
[ "$K1" != "$K2" ]; check $? "changeKey rotated on rewrite ($K1 → $K2)"

echo "── 3. F5: concurrent request stress (tabs/content/add/close races)"
STRESS=$(python3 - "$PORT" "$WORK" << 'PY'
import concurrent.futures, json, sys, urllib.request

port, work = sys.argv[1], sys.argv[2]
base = f"http://127.0.0.1:{port}"
errors = []

def get(path):
    with urllib.request.urlopen(base + path, timeout=5) as r:
        return json.loads(r.read())

def post(path, payload):
    req = urllib.request.Request(
        base + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Origin": base})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())

# Seed extra files
import pathlib
for i in range(8):
    pathlib.Path(f"{work}/f{i}.md").write_text(f"# f{i}\n")

def worker(i):
    try:
        if i % 4 == 0:
            r = post("/api/add", {"filepath": f"{work}/f{i % 8}.md"})
            if "id" in r and i % 8 == 0:
                try:
                    post("/api/close", {"id": r["id"]})
                except urllib.error.HTTPError as e:
                    if e.code != 404:  # 404 = lost the close race — correct behavior
                        raise
        elif i % 4 == 1:
            get("/api/tabs")
        else:
            tabs = get("/api/tabs")
            if tabs:
                get(f"/api/content?tab={tabs[0]['id']}")
    except Exception as e:
        errors.append(f"{i}: {e}")

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    list(ex.map(worker, range(200)))

print(f"errors={len(errors)}")
for e in errors[:5]:
    print("  ", e)
sys.exit(1 if errors else 0)
PY
)
RC=$?
echo "$STRESS" | sed 's/^/    /'
check $RC "200 concurrent mixed requests, zero errors"
curl -s --max-time 2 http://127.0.0.1:$PORT/api/tabs > /dev/null; check $? "server still responsive after stress"

echo "── 4. F8: SIGTERM clean shutdown"
kill -TERM $PID
sleep 1.5
kill -0 $PID 2>/dev/null && check 1 "process exited on SIGTERM" || check 0 "process exited on SIGTERM"
[ ! -f ~/.dabarat/instances/${PORT}.pid ]; check $? "PID file removed"
PID=""

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
