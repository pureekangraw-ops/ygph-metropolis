#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p app/build/emulator-evidence
collect_evidence() {
  timeout 15 adb logcat -d > app/build/emulator-evidence/logcat.txt || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-map-smoke.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-renderer-smoke.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-mobile-browser.png app/build/emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-mobile-location.png app/build/emulator-evidence/ || true
}
trap collect_evidence EXIT
gradle --no-daemon :app:connectedDebugAndroidTest
