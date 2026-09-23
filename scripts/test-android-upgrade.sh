#!/usr/bin/env bash
set -euo pipefail

# This emulator-only baseline uses the same permanent key as the delivered APK.
# Exercise Android's real replacement installation and AndroidKeyStore access.
runner=com.ewaste.marketplace.collector.test/androidx.test.runner.AndroidJUnitRunner
test=com.ewaste.nativeapp.UpgradePersistenceTest
adb install upgrade-baseline/app.apk
adb install -t upgrade-baseline/tests.apk
adb shell am instrument -w -r -e class "$test" -e upgradePhase seed "$runner" | tee upgrade-baseline/seed.txt
grep -q 'OK (1 test)' upgrade-baseline/seed.txt
adb install -r native-android/app/build/outputs/apk/release/app-release.apk | tee upgrade-baseline/install-update.txt
grep -q '^Success' upgrade-baseline/install-update.txt
adb shell am instrument -w -r -e class "$test" -e upgradePhase verify "$runner" | tee upgrade-baseline/verify.txt
grep -q 'OK (1 test)' upgrade-baseline/verify.txt
printf '\nAndroid 16: same-key update preserved draft, photo and encrypted pairing code.\n' >> apk-download/verification.txt
adb uninstall com.ewaste.marketplace.collector.test
