#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
gradle --no-daemon :app:connectedDebugAndroidTest
test_status=$?
mkdir -p app/build/emulator-evidence
# Collect while the runner's emulator is alive; the action shuts it down on return.
timeout 15s adb logcat -d > app/build/emulator-evidence/logcat.txt || true
timeout 15s adb pull /sdcard/Android/data/com.big.gobrowser/files/. app/build/emulator-evidence/ || true
exit "$test_status"
