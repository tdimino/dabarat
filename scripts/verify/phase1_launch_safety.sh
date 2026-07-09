#!/bin/bash
# Phase 1 verification — F1 launch safety + tab persistence.
# Runs entirely on scratch ports with a fake osascript (no GUI dialogs, no
# browser windows) and never touches a real instance on 3031.
#
# Usage: bash scripts/verify/phase1_launch_safety.sh
set -u

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d /tmp/dabarat-p1-XXXXXX)"
PORT=3777
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check(){ if [ "$1" = "0" ]; then ok "$2"; else bad "$2"; fi; }

cleanup() {
  [ -n "${PID_A:-}" ] && kill -9 "$PID_A" 2>/dev/null
  [ -n "${PID_NEW:-}" ] && kill -9 "$PID_NEW" 2>/dev/null
  [ -n "${PID_R:-}" ] && kill -9 "$PID_R" 2>/dev/null
  rm -f ~/.dabarat/instances/${PORT}.pid ~/.dabarat/instances/${PORT}.tabs.json
  [ -n "${NEW_PORT:-}" ] && rm -f ~/.dabarat/instances/${NEW_PORT}.pid ~/.dabarat/instances/${NEW_PORT}.tabs.json
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "# Test A.md" > "$WORK/A.md"
echo "# Test B.md" > "$WORK/B.md"

# Fake osascript: emits whatever DABARAT_TEST_DIALOG dictates
mkdir -p "$WORK/bin"
cat > "$WORK/bin/osascript" << 'FAKE'
#!/bin/bash
case "${DABARAT_TEST_DIALOG:-add}" in
  add)    echo "button returned:Add to Existing"; exit 0 ;;
  new)    echo "button returned:Open New Window"; exit 0 ;;
  cancel) echo "" ; exit 1 ;;
esac
FAKE
chmod +x "$WORK/bin/osascript"
export PATH="$WORK/bin:$PATH"

# Headless server launcher: cmd_serve with browser launch neutered
serve() {  # serve <logfile> <args...>
  local log="$1"; shift
  python3 -u -c "
import sys, webbrowser
import dabarat.__main__ as m
m._find_chrome = lambda: None
webbrowser.open = lambda *a, **k: True
sys.argv = ['dabarat'] + sys.argv[1:]
m.cmd_serve(sys.argv)
" "$@" > "$log" 2>&1 &
  echo $!
}

tabs_count() { curl -s --max-time 2 "http://127.0.0.1:$1/api/tabs" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))' 2>/dev/null || echo "ERR"; }

echo "── 1. Baseline server on $PORT"
PID_A=$(serve "$WORK/a.log" "$WORK/A.md" --port $PORT)
for i in $(seq 1 20); do curl -s --max-time 1 http://127.0.0.1:$PORT/api/tabs >/dev/null 2>&1 && break; sleep 0.25; done
[ "$(tabs_count $PORT)" = "1" ]; check $? "server A up with 1 tab"

echo "── 2. 'Add to Existing' appends, never kills"
DABARAT_TEST_DIALOG=add python3 -m dabarat "$WORK/B.md" --port $PORT >"$WORK/add.log" 2>&1
[ "$(tabs_count $PORT)" = "2" ]; check $? "tab count grew to 2"
kill -0 $PID_A 2>/dev/null; check $? "server A still alive"

echo "── 3. 'Cancel' is a no-op"
DABARAT_TEST_DIALOG=cancel python3 -m dabarat "$WORK/B.md" --port $PORT >"$WORK/cancel.log" 2>&1
grep -q "Cancelled" "$WORK/cancel.log"; check $? "prints Cancelled"
[ "$(tabs_count $PORT)" = "2" ]; check $? "tab count unchanged"
kill -0 $PID_A 2>/dev/null; check $? "server A still alive"

echo "── 4. 'Open New Window' takes a free port, leaves A untouched"
PID_NEW=$(DABARAT_TEST_DIALOG=new serve "$WORK/new.log" "$WORK/B.md" --port $PORT)
sleep 2
NEW_PORT=$(grep -o "new window on port [0-9]*" "$WORK/new.log" | grep -o "[0-9]*$")
if [ -n "$NEW_PORT" ]; then
  ok "allocated free port $NEW_PORT"
  [ "$(tabs_count $NEW_PORT)" = "1" ]; check $? "new instance serving 1 tab"
else
  bad "no free port allocated (log: $(head -3 "$WORK/new.log"))"
fi
[ "$(tabs_count $PORT)" = "2" ]; check $? "server A untouched (2 tabs)"
kill -0 $PID_A 2>/dev/null; check $? "server A still alive"
[ -n "${PID_NEW:-}" ] && kill -TERM $PID_NEW 2>/dev/null; sleep 1

echo "── 5. Tab session persisted"
python3 -c "
import json
d = json.load(open('$HOME/.dabarat/instances/${PORT}.tabs.json'))
assert d['port'] == $PORT and len(d['tabs']) == 2, d
print('  ✓ ${PORT}.tabs.json has 2 tabs')" || bad "tabs.json missing/wrong"
PASS=$((PASS+1))

echo "── 6. Crash recovery: kill -9, relaunch with no files restores tabs"
kill -9 $PID_A 2>/dev/null; sleep 0.5; PID_A=""
rm -f ~/.dabarat/instances/${PORT}.pid   # simulate what a crash leaves behind
PID_R=$(serve "$WORK/recover.log" --port $PORT)
for i in $(seq 1 20); do curl -s --max-time 1 http://127.0.0.1:$PORT/api/tabs >/dev/null 2>&1 && break; sleep 0.25; done
grep -q "Restored 2 tab" "$WORK/recover.log"; check $? "printed 'Restored 2 tab(s)'"
[ "$(tabs_count $PORT)" = "2" ]; check $? "both tabs restored"

echo "── 7. Clean exit clears session file"
kill -TERM $PID_R 2>/dev/null; sleep 1; PID_R=""
[ ! -f ~/.dabarat/instances/${PORT}.tabs.json ]; check $? "tabs.json removed on SIGTERM"

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
