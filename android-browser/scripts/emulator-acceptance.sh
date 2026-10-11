#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p app/build/emulator-evidence
# Match a compact phone: 360dp wide, 800dp tall.
adb shell wm size 720x1600
adb shell wm density 320
collect_evidence() {
  for name in observatory-gecko-browser observatory-gecko-menu observatory-gecko-details; do
    timeout 15 adb pull "/data/local/tmp/$name.png" app/build/emulator-evidence/ || true
  done
  timeout 15 adb logcat -d > app/build/emulator-evidence/logcat.txt || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-map-smoke.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-renderer-smoke.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-mobile-browser.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-mobile-location.png app/build/emulator-evidence/ || true
}
trap collect_evidence EXIT
set +e
set -o pipefail
gradle --no-daemon :app:connectedDebugAndroidTest 2>&1 | tee app/build/emulator-evidence/emulator-test.log
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
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
fi
exit "$status"

