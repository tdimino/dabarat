#!/bin/bash
# Phase 6 verification — F7 PID identity: JSON PID files, liveness-verified
# instance counting, _kill_port refusing responsive servers, helper flock.
set -u

WORK="$(mktemp -d /tmp/dabarat-p6-XXXXXX)"
PORT=3783
PASS=0; FAIL=0
check(){ if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi; }

cleanup() {
  [ -n "${PID:-}" ] && kill -9 "$PID" 2>/dev/null
  rm -f ~/.dabarat/instances/${PORT}.pid ~/.dabarat/instances/${PORT}.tabs.json
  rm -f ~/.dabarat/instances/9999.pid
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "# PID test" > "$WORK/pid.md"
python3 -u -c "
import sys, webbrowser
import dabarat.__main__ as m
m._find_chrome = lambda: None
webbrowser.open = lambda *a, **k: True
sys.argv = ['dabarat', '$WORK/pid.md', '--port', '$PORT']
m.cmd_serve(sys.argv)
" > "$WORK/server.log" 2>&1 &
PID=$!
for i in $(seq 1 20); do curl -s --max-time 1 http://127.0.0.1:$PORT/api/tabs >/dev/null 2>&1 && break; sleep 0.25; done

echo "── 1. PID file is enriched JSON"
python3 -c "
import json
d = json.load(open('$HOME/.dabarat/instances/${PORT}.pid'))
assert d['pid'] == $PID and d['port'] == $PORT and 'started' in d, d
print('  ✓ {pid, port, started} present')"
check $? "JSON PID format"

echo "── 2. _live_instances counts only responsive instances"
python3 -c "
from dabarat.__main__ import _live_instances
live = _live_instances()
assert ($PORT, $PID) in live, live
print('  ✓ live instance found:', [(p, pid) for p, pid in live if p == $PORT])"
check $? "responsive instance counted"

echo "── 3. Stale JSON PID (dead pid, old timestamp) is cleaned"
python3 -c "
import json, os
json.dump({'pid': 999999, 'port': 9999, 'started': '2020-01-01T00:00:00+00:00'},
          open(os.path.expanduser('~/.dabarat/instances/9999.pid'), 'w'))
from dabarat.__main__ import _live_instances
live = _live_instances()
assert not any(p == 9999 for p, _ in live), live
assert not os.path.exists(os.path.expanduser('~/.dabarat/instances/9999.pid')), 'stale file not removed'
print('  ✓ stale PID file removed')"
check $? "stale cleanup works"

echo "── 4. Legacy plain-int PID file still parses"
python3 -c "
import os
open(os.path.expanduser('~/.dabarat/instances/9999.pid'), 'w').write('999999')
from dabarat.__main__ import _live_instances
live = _live_instances()
assert not any(p == 9999 for p, _ in live), live
assert not os.path.exists(os.path.expanduser('~/.dabarat/instances/9999.pid'))
print('  ✓ legacy format handled + cleaned')"
check $? "legacy format compat"

echo "── 5. _kill_zombie_on_port refuses a responsive dabarat (exit 1, no kill)"
python3 -c "
from dabarat.__main__ import _kill_zombie_on_port
_kill_zombie_on_port($PORT)" 2>/dev/null
RC=$?
[ "$RC" = "1" ]; check $? "aborted with exit 1 instead of killing (rc=$RC)"
sleep 0.5
kill -0 $PID 2>/dev/null; check $? "server survived"
curl -s --max-time 2 http://127.0.0.1:$PORT/api/tabs > /dev/null; check $? "server still responsive"

echo "── 5b. Unknown port holder refused (identity check)"
python3 - "$PORT" << 'PY'
import sys
from dabarat.__main__ import _port_listeners, _recorded_pid
port = int(sys.argv[1])
pids = _port_listeners(port)
rec = _recorded_pid(port)
assert pids and rec in pids, (pids, rec)
print(f"  ✓ listener {pids} matches recorded pid {rec}")
PY
check $? "recorded PID matches TCP listener"

echo "── 6. Helper heredoc contains flock serialization"
grep -q "fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)" macos/build.sh; check $? "flock in build.sh heredoc"

kill -TERM $PID 2>/dev/null; sleep 1; PID=""
echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
