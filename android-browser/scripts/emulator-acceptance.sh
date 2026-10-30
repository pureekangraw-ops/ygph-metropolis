#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p app/build/emulator-evidence
# Match a compact phone: 360dp wide, 800dp tall.
adb shell wm size 720x1600
adb shell wm density 320
# The emulator action sends MENU once at boot, but the window focus can be lost
# before instrumentation starts on hosted API 35 runners. Explicitly wake and
# dismiss the emulator's non-secure test keyguard before Espresso launches.
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard || true
adb shell input keyevent 82
adb shell settings put system screen_off_timeout 1800000 || true
sleep 2
collect_evidence() {
  for name in observatory-gecko-browser observatory-gecko-menu observatory-gecko-details goview-synthetic-39; do
    timeout 15 adb pull "/data/local/tmp/$name.png" app/build/emulator-evidence/ || true
  done
  timeout 15 adb logcat -d > app/build/emulator-evidence/logcat.txt || true
  # Keep focused synthetic GOVIEW diagnostics accessible in job logs as well as ZIP evidence.
  grep 'GeckoRecoveryTrace' app/build/emulator-evidence/logcat.txt || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-map-flow.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-map-smoke.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-renderer-smoke.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-mobile-browser.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-mobile-location.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/goview-studio-go-drawn.png app/build/emulator-evidence/ || true
}
trap collect_evidence EXIT
set +e
set -o pipefail
gradle --no-daemon :app:connectedDebugAndroidTest 2>&1 | tee app/build/emulator-evidence/emulator-test.log
status=${PIPESTATUS[0]}
if [ "$status" -eq 0 ]; then
  bash scripts/goview-b2e-emulator.sh
  status=$?
fi
if [ "$status" -eq 0 ]; then
  bash scripts/goview-typed-emulator.sh
  status=$?
fi
if [ "$status" -ne 0 ]; then
  echo "--- Emulator power/window focus diagnostics ---"
  timeout 15 adb shell dumpsys power | grep -E 'mWakefulness=|mInteractive=' || true
  timeout 15 adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp|mDreamingLockscreen' || true
  grep -E '(FAILURES|There were failing tests|FAILED|Exception|AssertionError|Process crashed|Test run failed|No tests found|INSTRUMENTATION_STATUS: stack)' app/build/emulator-evidence/emulator-test.log | tail -n 80 | while IFS= read -r line; do
    safe="${line//'%'/'%25'}"
    safe="${safe//$'\r'/'%0D'}"
    safe="${safe//$'\n'/'%0A'}"
    echo "::error title=Emulator::$safe"
  done
  find app/build/outputs/androidTest-results/connected -type f -name '*.xml' -print0 2>/dev/null | xargs -0 -r grep -h -E '(<failure|<error)' | tail -n 40 | while IFS= read -r line; do
    safe="${line//'%'/'%25'}"
    safe="${safe//$'\r'/'%0D'}"
    safe="${safe//$'\n'/'%0A'}"
    echo "::error title=JUnit::$safe"
  done
  # Preserve actionable nested Espresso causes for synthetic GOVIEW failures.
  python3 - <<'PYDIAG'
from pathlib import Path
import xml.etree.ElementTree as ET
for path in Path('app/build/outputs/androidTest-results/connected').rglob('*.xml'):
    try: root = ET.parse(path).getroot()
    except ET.ParseError: continue
    for case in root.iter('testcase'):
        if not any(x in case.get('classname', '') for x in ('Goview', 'OutsideViewFlowTest')): continue
        for failure in list(case.findall('failure')) + list(case.findall('error')):
            print('GOVIEW_FAILURE_DETAIL ' + case.get('name', ''))
            print((failure.text or '')[:6000])
PYDIAG
fi
exit "$status"

