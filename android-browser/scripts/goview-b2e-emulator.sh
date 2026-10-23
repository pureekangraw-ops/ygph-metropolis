#!/usr/bin/env bash
# Synthetic CI emulator only; never a handset install or data-reset script.
set -euo pipefail
if [ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" != "1" ]; then
  echo "GOVIEW B2E refuses a non-emulator target" >&2
  exit 1
fi
adb install -r -t app/build/outputs/apk/debug/app-debug.apk
adb install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
for phase in before after; do
  if [ "$phase" = "after" ]; then
    adb shell am force-stop com.big.gobrowser
    if adb shell pidof com.big.gobrowser; then
      echo "GOVIEW process did not stop" >&2
      exit 1
    fi
  fi
  log="app/build/emulator-evidence/goview-b2e-$phase.log"
  adb shell am instrument -w -r \
    -e class com.big.gobrowser.browser.GoviewB2EChainTest \
    -e goviewPhase "$phase" \
    com.big.gobrowser.test/androidx.test.runner.AndroidJUnitRunner | tee "$log"
  # am instrument can return exit0 even when JUnit fails: inspect its actual result.
  python3 - "$log" <<'PY'
from pathlib import Path
import sys
text=Path(sys.argv[1]).read_text()
assert 'OK (1 test)' in text, text
assert 'FAILURES!!!' not in text and 'INSTRUMENTATION_FAILED' not in text, text
print('GOVIEW_B2E_PHASE_PASS',Path(sys.argv[1]).name)
PY
done
