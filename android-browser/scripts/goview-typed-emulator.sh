#!/usr/bin/env bash
# Synthetic emulator-only cross-runtime acceptance. Never install on a physical owner device.
set -euo pipefail
if [ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" != "1" ]; then
  echo "Typed GOVIEW chain refuses a non-emulator target" >&2
  exit 1
fi
: "${GOVIEW_GO_ADAPTER:?Set exact pinned GO worker/goview-direct.mjs path}"
test -f "$GOVIEW_GO_ADAPTER"
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p app/build/emulator-evidence
evidence_dir="$(cd app/build/emulator-evidence && pwd)"
port_file="$evidence_dir/goview-typed-port.txt"
fixture_log="$evidence_dir/goview-typed-fixture.log"
rm -f "$port_file"
fixture_pid=''
port=''
cleanup() {
  if [ -n "$port" ]; then adb reverse --remove "tcp:$port" >/dev/null 2>&1 || true; fi
  if [ -n "$fixture_pid" ]; then kill "$fixture_pid" >/dev/null 2>&1 || true; wait "$fixture_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
GOVIEW_REQUIRE_ACTUAL_GO=true node "$repo_root/goview-package-bridge/tests/typed-server-fixture.mjs" > "$port_file" 2> "$fixture_log" &
fixture_pid=$!
port="$(python3 - "$port_file" "$fixture_pid" <<'PY'
import os,sys,time
from pathlib import Path
p=Path(sys.argv[1]);pid=int(sys.argv[2]);end=time.monotonic()+15
while time.monotonic()<end:
    os.kill(pid,0)
    text=p.read_text().strip() if p.exists() else ''
    if text:
        port=int(text);assert 1024<=port<=65535;print(port);break
    time.sleep(.1)
else: raise RuntimeError('Synthetic typed fixture failed to start')
PY
)"
adb reverse "tcp:$port" "tcp:$port"
sha256sum "$GOVIEW_GO_ADAPTER" "$repo_root/goview-package-bridge/worker.mjs" > "$evidence_dir/goview-typed-source-sha256.txt"
adb install -r -t app/build/outputs/apk/debug/app-debug.apk
adb install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
for phase in before after; do
  if [ "$phase" = "after" ]; then
    adb shell am force-stop com.big.gobrowser
    if adb shell pidof com.big.gobrowser; then echo "Typed chain process did not stop" >&2; exit 1; fi
  fi
  log="$evidence_dir/goview-typed-$phase.log"
  adb shell am instrument -w -r \
    -e class com.big.gobrowser.outsideview.GoviewTypedChainTest \
    -e goviewTypedPhase "$phase" -e goviewTypedPort "$port" \
    com.big.gobrowser.test/androidx.test.runner.AndroidJUnitRunner | tee "$log"
  python3 - "$log" "$phase" <<'PY'
from pathlib import Path
import sys
text=Path(sys.argv[1]).read_text();phase=sys.argv[2].upper()
assert 'OK (1 test)' in text,text
assert 'GOVIEW_TYPED_CHAIN_'+phase+'_PASS' in text,text
assert not any(x in text for x in ['FAILURES!!!','INSTRUMENTATION_FAILED','AssumptionViolated','INSTRUMENTATION_STATUS_CODE: -3','INSTRUMENTATION_STATUS_CODE: -4']),text
print('TYPED_GOVIEW_EMULATOR_PHASE_VERIFIED',phase)
PY
done
