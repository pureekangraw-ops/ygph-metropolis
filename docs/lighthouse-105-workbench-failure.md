# LIGHTHOUSE 1.0.5 Gate A diagnostic

Exit code: 1

## Failed tests
```text
403-  duration_ms: 1.783733
404-  type: 'test'
405-  ...
406-# Subtest: Calendar reschedule changes only due date, archives prior Calendar truth, and never mutates Ledger
407-ok 67 - Calendar reschedule changes only due date, archives prior Calendar truth, and never mutates Ledger
408-  ---
409-  duration_ms: 11.535367
410-  type: 'test'
411-  ...
412-# Subtest: Calendar reschedule rejects closed queues
413-ok 68 - Calendar reschedule rejects closed queues
414-  ---
415-  duration_ms: 1.303917
416-  type: 'test'
417-  ...
418-# Subtest: LIGHTHOUSE exposes one Calendar surface and keeps creation inside that same flow
419:not ok 69 - LIGHTHOUSE exposes one Calendar surface and keeps creation inside that same flow
420-  ---
421-  duration_ms: 8.496849
422-  type: 'test'
423-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-calendar-single-home.test.cjs:9:1'
424-  failureType: 'testCodeFailure'
425-  error: 'no second Calendar list may be created by MANUAL'
426-  code: 'ERR_ASSERTION'
427-  name: 'AssertionError'
428-  expected:
429-  actual: |-
430-    import { createRecordReference, resolveRecordReference } from '../greenfield/context-reference.mjs';
431-    
432-    function node(documentRef, tag, attrs = {}, text = '') {
433-      const element = documentRef.createElement(tag);
434-      for (const [key, value] of Object.entries(attrs)) {
435-        if (key === 'className') element.className = value;
436-        else if (key === 'dataset') Object.assign(element.dataset, value);
437-        else if (key === 'hidden') element.hidden = Boolean(value);
438-        else element.setAttribute(key, value);
439-      }
440-      if (text) element.textContent = text;
441-      return element;
442-    }
443-    
444-    function field(documentRef, labelText, name, options = {}) {
445-      const label = node(documentRef, 'label', {}, labelText);
446-      const input = options.select ? node(documentRef, 'select', { name }) : node(documentRef, 'input', { name, ...(options.type ? { type:options.type } : {}), ...(options.inputmode ? { inputmode:options.inputmode } : {}) });
447-      if (options.required) input.required = true;
```

## Summary tail
```text
ok 481 - obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing
  ---
  duration_ms: 463.714395
  type: 'test'
  ...
# Subtest: sale workflow rejects projected Store stock below zero and writes nothing
ok 482 - sale workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 460.644045
  type: 'test'
  ...
# Subtest: withdrawal workflow rejects projected Store stock below zero and writes nothing
ok 483 - withdrawal workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 459.36703
  type: 'test'
  ...
# Subtest: negative adjustment workflow rejects projected Store stock below zero and writes nothing
ok 484 - negative adjustment workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 458.635616
  type: 'test'
  ...
# Subtest: Store workflow allows final projected stock exactly zero
ok 485 - Store workflow allows final projected stock exactly zero
  ---
  duration_ms: 641.534176
  type: 'test'
  ...
# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
ok 486 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
  ---
  duration_ms: 647.097773
  type: 'test'
  ...
# Subtest: Settings is a grouped utility index instead of a fifth working house
ok 487 - Settings is a grouped utility index instead of a fifth working house
  ---
  duration_ms: 1.350502
  type: 'test'
  ...
# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
ok 488 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
  ---
  duration_ms: 0.393074
  type: 'test'
  ...
# Subtest: normal APK update view stays human-facing while Web cache status is advanced
ok 489 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 1.185344
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 490 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.354632
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 491 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.343532
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 492 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.217366
  type: 'test'
  ...
1..492
# tests 492
# suites 0
# pass 491
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 55461.312715
```
