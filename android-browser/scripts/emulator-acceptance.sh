#!/usr/bin/env bash
set -euo pipefail
mkdir -p /tmp/observatory-emulator-evidence
collect_evidence() {
  timeout 15 adb logcat -d > /tmp/observatory-emulator-evidence/logcat.txt || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-map-smoke.png /tmp/observatory-emulator-evidence/ || true
  timeout 15 adb pull /sdcard/Android/data/com.big.gobrowser/files/observatory-renderer-smoke.png /tmp/observatory-emulator-evidence/ || true
}
trap collect_evidence EXIT
gradle --no-daemon :app:connectedDebugAndroidTest
