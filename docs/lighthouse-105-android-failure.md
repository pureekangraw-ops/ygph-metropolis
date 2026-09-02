# LIGHTHOUSE 1.0.5 Android exact failures

```text
  type: 'test'
  ...
# Subtest: standard APK flow delegates current Patch ownership instead of hard-coding a release number
not ok 15 - standard APK flow delegates current Patch ownership instead of hard-coding a release number
  ---
  duration_ms: 8.230791
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/apk-ci-signing-contract.test.mjs:12:1'
  failureType: 'testCodeFailure'
  error: |-
    The input did not match the regular expression /build-current-patch-source\.mjs/. Input:
    
    'name: LIGHTHOUSE APK Debug\n' +
      '\n' +
      'on:\n' +
      '  workflow_dispatch:\n' +
      '  pull_request:\n' +
      '    paths:\n' +
      "      - 'android-shell/**'\n" +
      "      - 'ui/**'\n" +
      "      - 'lighthouse/**'\n" +
      "      - 'styles/**'\n" +
      "      - 'lighthouse.css'\n" +
      "      - 'sw.js'\n" +
      "      - '.github/workflows/lighthouse-apk-debug.yml'\n" +
      '\n' +
      'permissions:\n' +
      '  contents: write\n' +
--
  type: 'test'
  ...
# Subtest: Patch and APK signing trust domains stay isolated
not ok 17 - Patch and APK signing trust domains stay isolated
  ---
  duration_ms: 1.451773
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/apk-ci-signing-contract.test.mjs:37:1'
  failureType: 'testCodeFailure'
  error: 'missing standard Patch signing step'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: -1
  actual: -1
  operator: 'notStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/apk-ci-signing-contract.test.mjs:41:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: APK publication is downstream of generated security and final-byte identity verification
not ok 18 - APK publication is downstream of generated security and final-byte identity verification
  ---
  duration_ms: 2.572928
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/apk-ci-signing-contract.test.mjs:54:1'
  failureType: 'testCodeFailure'
  error: 'APK upload must happen after identity verification'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/apk-ci-signing-contract.test.mjs:63:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: identity evidence binds to the PR head source commit instead of the synthetic PR merge SHA
ok 19 - identity evidence binds to the PR head source commit instead of the synthetic PR merge SHA
  ---
  duration_ms: 1.916351
  type: 'test'
  ...
# Subtest: APK identity contract pins LIGHTHOUSE package and canonical signer without secrets
ok 20 - APK identity contract pins LIGHTHOUSE package and canonical signer without secrets
--
  type: 'test'
  ...
# Subtest: staged Android app keeps existing source byte-identical: index.html
not ok 52 - staged Android app keeps existing source byte-identical: index.html
  ---
  duration_ms: 12.015563
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:24:3'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
      '<!doctype html>\n' +
        '<html lang="th">\n' +
        '<head>\n' +
        '  <meta charset="utf-8">\n' +
    +   '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    +   '  <meta name="description" content="LIGHTHOUSE APK Foundation Proof">\n' +
    -   '  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
    -   '  <meta name="theme-color" content="#101617">\n' +
    -   '  <meta name="referrer" content="no-referrer">\n' +
    -   `  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; worker-src 'self'; manifest-src 'self'">\n` +
    -   '  <link rel="manifest" href="manifest.webmanifest">\n' +
    -   '  <link rel="stylesheet" href="styles.css">\n' +
        '  <title>LIGHTHOUSE</title>\n' +
    +   '  <style>\n' +
    +   '    :root { font-family: system-ui, sans-serif; color-scheme: dark; }\n' +
--
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: staged Android app keeps existing source byte-identical: app.mjs
not ok 53 - staged Android app keeps existing source byte-identical: app.mjs
  ---
  duration_ms: 4.161218
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:24:3'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/app.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:26:7)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: staged Android app keeps existing source byte-identical: lighthouse.css
not ok 54 - staged Android app keeps existing source byte-identical: lighthouse.css
  ---
  duration_ms: 1.372284
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:24:3'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/lighthouse.css'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:26:7)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: staged Android app keeps existing source byte-identical: ui/app.mjs
not ok 55 - staged Android app keeps existing source byte-identical: ui/app.mjs
  ---
  duration_ms: 1.574983
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:24:3'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/app.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:26:7)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: staged Android app keeps existing source byte-identical: ui/master-input.mjs
not ok 56 - staged Android app keeps existing source byte-identical: ui/master-input.mjs
  ---
  duration_ms: 1.447936
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:24:3'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/master-input.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:26:7)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: staged Android app keeps existing source byte-identical: ui/manual-finance-ui.mjs
not ok 57 - staged Android app keeps existing source byte-identical: ui/manual-finance-ui.mjs
  ---
  duration_ms: 1.379878
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:24:3'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/manual-finance-ui.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:26:7)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: staged Android app keeps existing source byte-identical: ui/settings-ui.mjs
not ok 58 - staged Android app keeps existing source byte-identical: ui/settings-ui.mjs
  ---
  duration_ms: 3.619935
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:24:3'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/settings-ui.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:26:7)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: staged Android app keeps existing source byte-identical: ui/lighthouse-shell.mjs
not ok 59 - staged Android app keeps existing source byte-identical: ui/lighthouse-shell.mjs
  ---
  duration_ms: 1.173513
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:24:3'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/lighthouse-shell.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:26:7)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: existing Chat ↔ Manual bridge wiring is packaged
not ok 60 - existing Chat ↔ Manual bridge wiring is packaged
  ---
  duration_ms: 1.605751
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:32:1'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/app.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:33:18)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: LIGHTHOUSE three-page coastal shell is packaged without replacing domain runtime
not ok 61 - LIGHTHOUSE three-page coastal shell is packaged without replacing domain runtime
  ---
  duration_ms: 1.758786
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:45:1'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/lighthouse-shell.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async Promise.all (index 0)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:46:31)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: existing Manual ask action is packaged
not ok 62 - existing Manual ask action is packaged
  ---
  duration_ms: 1.131004
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:65:1'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/manual-finance-ui.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:66:18)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: existing Settings utility is packaged
not ok 63 - existing Settings utility is packaged
  ---
  duration_ms: 1.017591
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:71:1'
  failureType: 'testCodeFailure'
  error: "ENOENT: no such file or directory, open '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/www/ui/settings-ui.mjs'"
  code: 'ENOENT'
  stack: |-
    async open (node:internal/fs/promises:639:25)
    async readFile (node:internal/fs/promises:1252:14)
    async TestContext.<anonymous> (file:///home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:72:18)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: Android entry starts the existing application directly and never waits for snapshot bootstrap
not ok 64 - Android entry starts the existing application directly and never waits for snapshot bootstrap
  ---
  duration_ms: 1.505734
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/existing-full-app-package.test.mjs:79:1'
  failureType: 'testCodeFailure'
  error: |-
    The input did not match the regular expression /src="ui\/master-input\.mjs"/. Input:
    
    '<!doctype html>\n' +
      '<html lang="th">\n' +
      '<head>\n' +
      '  <meta charset="utf-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
      '  <meta name="description" content="LIGHTHOUSE APK Foundation Proof">\n' +
      '  <title>LIGHTHOUSE</title>\n' +
      '  <style>\n' +
      '    :root { font-family: system-ui, sans-serif; color-scheme: dark; }\n' +
      '    body { margin: 0; min-height: 100vh; background: #10151d; color: #f5f7fb; }\n' +
      '    .patch-controls { box-sizing: border-box; width: 100%; display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; padding: .8rem 1rem; border-top: 1px solid #293241; background: #0c1118; }\n' +
      '    .patch-controls button { font: inherit; padding: .4rem .7rem; }\n' +
      '    .patch-controls input { display:none; }\n' +
      '    #patch-status { flex: 1 1 12rem; margin: 0; font-size: .85rem; color: #c7d0dc; }\n' +
      '  </style>\n' +
      '</head>\n' +
--
  type: 'test'
  ...
# Subtest: GitHub Actions builds a canonical verified APK but never deploys or publishes it
not ok 69 - GitHub Actions builds a canonical verified APK but never deploys or publishes it
  ---
  duration_ms: 7.05857
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/foundation-contract.test.mjs:43:1'
  failureType: 'testCodeFailure'
  error: |-
    The input was expected to not match the regular expression /\bdeploy\b|google[-_ ]?play|play[-_ ]?console|\bpublish\b/i. Input:
    
    'name: LIGHTHOUSE APK Debug\n' +
      '\n' +
      'on:\n' +
      '  workflow_dispatch:\n' +
      '  pull_request:\n' +
      '    paths:\n' +
      "      - 'android-shell/**'\n" +
      "      - 'ui/**'\n" +
      "      - 'lighthouse/**'\n" +
      "      - 'styles/**'\n" +
      "      - 'lighthouse.css'\n" +
      "      - 'sw.js'\n" +
      "      - '.github/workflows/lighthouse-apk-debug.yml'\n" +
      '\n' +
      'permissions:\n' +
      '  contents: write\n' +
--
  type: 'test'
  ...
# Subtest: standard APK workflow builds signs verifies and uploads the current key-3 Patch plus manifest
not ok 82 - standard APK workflow builds signs verifies and uploads the current key-3 Patch plus manifest
  ---
  duration_ms: 3.515269
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/front-door-release-source.test.mjs:39:1'
  failureType: 'testCodeFailure'
  error: |-
    The input did not match the regular expression /build-current-patch-source\.mjs/u. Input:
    
    'name: LIGHTHOUSE APK Debug\n' +
      '\n' +
      'on:\n' +
      '  workflow_dispatch:\n' +
      '  pull_request:\n' +
      '    paths:\n' +
      "      - 'android-shell/**'\n" +
      "      - 'ui/**'\n" +
      "      - 'lighthouse/**'\n" +
      "      - 'styles/**'\n" +
      "      - 'lighthouse.css'\n" +
      "      - 'sw.js'\n" +
      "      - '.github/workflows/lighthouse-apk-debug.yml'\n" +
      '\n' +
      'permissions:\n' +
      '  contents: write\n' +
--
  type: 'test'
  ...
# Subtest: staging is readable before activation and does not move current
not ok 106 - staging is readable before activation and does not move current
  ---
  duration_ms: 2.715435
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/patch-contract.test.mjs:248:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   currentSnapshotId: null,
        currentVersion: '0.0.1',
    +   previousSnapshotId: null,
        previousVersion: null
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    currentVersion: '0.0.1'
    previousVersion: ~
  actual:
    currentVersion: '0.0.1'
    previousVersion: ~
--
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: activation moves current and previous pointers together
not ok 107 - activation moves current and previous pointers together
  ---
  duration_ms: 1.290642
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/patch-contract.test.mjs:266:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   currentSnapshotId: null,
        currentVersion: '0.0.2',
    +   previousSnapshotId: null,
        previousVersion: '0.0.1'
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    currentVersion: '0.0.2'
    previousVersion: '0.0.1'
  actual:
    currentVersion: '0.0.2'
    previousVersion: '0.0.1'
--
  type: 'test'
  ...
# Subtest: stale activation is rejected after current advances
not ok 109 - stale activation is rejected after current advances
  ---
  duration_ms: 0.849377
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/patch-contract.test.mjs:302:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   currentSnapshotId: null,
        currentVersion: '0.0.3',
    +   previousSnapshotId: null,
        previousVersion: '0.0.1'
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    currentVersion: '0.0.3'
    previousVersion: '0.0.1'
  actual:
    currentVersion: '0.0.3'
    previousVersion: '0.0.1'
--
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: failed staging leaves the active snapshot untouched
not ok 110 - failed staging leaves the active snapshot untouched
  ---
  duration_ms: 0.960986
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/patch-contract.test.mjs:330:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   currentSnapshotId: null,
        currentVersion: '0.0.1',
    +   previousSnapshotId: null,
        previousVersion: null
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    currentVersion: '0.0.1'
    previousVersion: ~
  actual:
    currentVersion: '0.0.1'
    previousVersion: ~
--
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: rollback atomically swaps back to the previous complete snapshot
not ok 111 - rollback atomically swaps back to the previous complete snapshot
  ---
  duration_ms: 2.228335
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/patch-contract.test.mjs:347:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   currentSnapshotId: null,
        currentVersion: '0.0.1',
    +   previousSnapshotId: null,
        previousVersion: '0.0.2'
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    currentVersion: '0.0.1'
    previousVersion: '0.0.2'
  actual:
    currentVersion: '0.0.1'
    previousVersion: '0.0.2'
--
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: IndexedDB store persists the active pointer and supports rollback after reopen
not ok 112 - IndexedDB store persists the active pointer and supports rollback after reopen
  ---
  duration_ms: 18.52079
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/patch-contract.test.mjs:367:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   currentSnapshotId: null,
        currentVersion: '0.0.2',
    +   previousSnapshotId: null,
        previousVersion: '0.0.1'
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    currentVersion: '0.0.2'
    previousVersion: '0.0.1'
  actual:
    currentVersion: '0.0.2'
    previousVersion: '0.0.1'
--
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: concurrent imports cannot activate a stale patch over a newer patch
not ok 113 - concurrent imports cannot activate a stale patch over a newer patch
  ---
  duration_ms: 11.465321
  type: 'test'
  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/android-shell/test/patch-contract.test.mjs:406:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   currentSnapshotId: null,
        currentVersion: '0.0.3',
    +   previousSnapshotId: null,
        previousVersion: '0.0.1'
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    currentVersion: '0.0.3'
    previousVersion: '0.0.1'
  actual:
    currentVersion: '0.0.3'
    previousVersion: '0.0.1'

  ---
  duration_ms: 1345.339493
  type: 'test'
  ...
# Subtest: buildUpdateMetadata emits compatible verified read-only manifest from final APK evidence
ok 150 - buildUpdateMetadata emits compatible verified read-only manifest from final APK evidence
  ---
  duration_ms: 13.52489
  type: 'test'
  ...
# Subtest: metadata generator rejects non-HTTPS URL, signer mismatch and evidence hash mismatch
ok 151 - metadata generator rejects non-HTTPS URL, signer mismatch and evidence hash mismatch
  ---
  duration_ms: 7.273499
  type: 'test'
  ...
1..151
# tests 151
# suites 0
# pass 126
# fail 25
# cancelled 0
# skipped 0
# todo 0
# duration_ms 14917.857671
```
