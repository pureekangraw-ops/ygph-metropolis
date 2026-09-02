# LIGHTHOUSE 1.0.5 Gate A diagnostic

Exit code: 1

```text
  duration_ms: 0.346211
  type: 'test'
  ...
# Subtest: partial Sale outstanding is counted exactly once from Sale source truth
ok 450 - partial Sale outstanding is counted exactly once from Sale source truth
  ---
  duration_ms: 0.321645
  type: 'test'
  ...
# Subtest: legacy imported Sale without outstanding fields uses its single related active queue as compatibility evidence
ok 451 - legacy imported Sale without outstanding fields uses its single related active queue as compatibility evidence
  ---
  duration_ms: 0.9951
  type: 'test'
  ...
# Subtest: cancelling the only legacy receive queue preserves its last known receivable amount but marks it UNSCHEDULED
ok 452 - cancelling the only legacy receive queue preserves its last known receivable amount but marks it UNSCHEDULED
  ---
  duration_ms: 0.329417
  type: 'test'
  ...
# Subtest: legacy Sale with multiple related queues surfaces VERIFY without guessing an amount
ok 453 - legacy Sale with multiple related queues surfaces VERIFY without guessing an amount
  ---
  duration_ms: 0.33153
  type: 'test'
  ...
# Subtest: reconciliation permits Calendar installment remainder to differ from Ledger obligation exposure
ok 454 - reconciliation permits Calendar installment remainder to differ from Ledger obligation exposure
  ---
  duration_ms: 5.897783
  type: 'test'
  ...
# Subtest: orphan money queue becomes VERIFY and is not silently repaired
ok 455 - orphan money queue becomes VERIFY and is not silently repaired
  ---
  duration_ms: 1.886788
  type: 'test'
  ...
# Subtest: negative calculated stock is a hard reconciliation failure
ok 456 - negative calculated stock is a hard reconciliation failure
  ---
  duration_ms: 16.057634
  type: 'test'
  ...
# Subtest: Calendar executable money buttons are gated by the state-aware action contract
ok 457 - Calendar executable money buttons are gated by the state-aware action contract
  ---
  duration_ms: 1.250708
  type: 'test'
  ...
# Subtest: Finance UI reads cash truth and does not present Ledger balance as spendable truth
ok 458 - Finance UI reads cash truth and does not present Ledger balance as spendable truth
  ---
  duration_ms: 1.372488
  type: 'test'
  ...
# Subtest: unproven Calendar money action renders a verify message rather than an executable payment action
ok 459 - unproven Calendar money action renders a verify message rather than an executable payment action
  ---
  duration_ms: 0.31119
  type: 'test'
  ...
# Subtest: Home Store and Finance rendering are isolated behind focused city modules
ok 460 - Home Store and Finance rendering are isolated behind focused city modules
  ---
  duration_ms: 1.256396
  type: 'test'
  ...
# Subtest: OPEN monetary VERIFY owned by LEDGER resolves to expense confirmation, never generic Calendar completion
ok 461 - OPEN monetary VERIFY owned by LEDGER resolves to expense confirmation, never generic Calendar completion
  ---
  duration_ms: 3.762529
  type: 'test'
  ...
# Subtest: verified expense workflow atomically writes Ledger OUT linked to Calendar then completes the verify queue
ok 462 - verified expense workflow atomically writes Ledger OUT linked to Calendar then completes the verify queue
  ---
  duration_ms: 2.121965
  type: 'test'
  ...
# Subtest: repair workflow writes only the missing Ledger OUT and preserves an already-completed Calendar record
ok 463 - repair workflow writes only the missing Ledger OUT and preserves an already-completed Calendar record
  ---
  duration_ms: 0.25062
  type: 'test'
  ...
# Subtest: completed monetary VERIFY without a linked Ledger OUT remains repairable, but cannot duplicate once linked
ok 464 - completed monetary VERIFY without a linked Ledger OUT remains repairable, but cannot duplicate once linked
  ---
  duration_ms: 0.506648
  type: 'test'
  ...
# Subtest: generic non-money VERIFY keeps Calendar-only completion semantics
ok 465 - generic non-money VERIFY keeps Calendar-only completion semantics
  ---
  duration_ms: 0.252954
  type: 'test'
  ...
# Subtest: runtime durable path records Ledger OUT and completes an OPEN monetary VERIFY together
ok 466 - runtime durable path records Ledger OUT and completes an OPEN monetary VERIFY together
  ---
  duration_ms: 1435.353121
  type: 'test'
  ...
# Subtest: runtime repair adds only missing Ledger OUT for a completed VERIFY and blocks a duplicate repair
ok 467 - runtime repair adds only missing Ledger OUT for a completed VERIFY and blocks a duplicate repair
  ---
  duration_ms: 1994.359824
  type: 'test'
  ...
# Subtest: UI sends monetary VERIFY into the expense form and does not call calendarStatus directly
ok 468 - UI sends monetary VERIFY into the expense form and does not call calendarStatus directly
  ---
  duration_ms: 0.594168
  type: 'test'
  ...
# Subtest: visual polish contract is present without changing interaction architecture
ok 469 - visual polish contract is present without changing interaction architecture
  ---
  duration_ms: 1.131782
  type: 'test'
  ...
# Subtest: mobile workspace clears the sticky app header when restoring a scrolled city view
ok 470 - mobile workspace clears the sticky app header when restoring a scrolled city view
  ---
  duration_ms: 0.268947
  type: 'test'
  ...
# Subtest: workflow authority validates a Calendar queue created inside the same plan before any mutation
ok 471 - workflow authority validates a Calendar queue created inside the same plan before any mutation
  ---
  duration_ms: 502.664868
  type: 'test'
  ...
# Subtest: workflow authority fails closed on multiple payment relations until an explicit keyed multi-payment contract exists
ok 472 - workflow authority fails closed on multiple payment relations until an explicit keyed multi-payment contract exists
  ---
  duration_ms: 550.635032
  type: 'test'
  ...
# Subtest: atomic workflow commits Store + Ledger commands in one durable write
ok 473 - atomic workflow commits Store + Ledger commands in one durable write
  ---
  duration_ms: 810.730789
  type: 'test'
  ...
# Subtest: atomic workflow writes nothing when a later command fails
ok 474 - atomic workflow writes nothing when a later command fails
  ---
  duration_ms: 460.19966
  type: 'test'
  ...
# Subtest: receivable payment rejects a Calendar queue belonging to a different Store sale and writes nothing
ok 475 - receivable payment rejects a Calendar queue belonging to a different Store sale and writes nothing
  ---
  duration_ms: 469.605408
  type: 'test'
  ...
# Subtest: obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing
ok 476 - obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing
  ---
  duration_ms: 429.370361
  type: 'test'
  ...
# Subtest: sale workflow rejects projected Store stock below zero and writes nothing
ok 477 - sale workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 384.911475
  type: 'test'
  ...
# Subtest: withdrawal workflow rejects projected Store stock below zero and writes nothing
ok 478 - withdrawal workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 384.238991
  type: 'test'
  ...
# Subtest: negative adjustment workflow rejects projected Store stock below zero and writes nothing
ok 479 - negative adjustment workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 383.807974
  type: 'test'
  ...
# Subtest: Store workflow allows final projected stock exactly zero
ok 480 - Store workflow allows final projected stock exactly zero
  ---
  duration_ms: 537.178174
  type: 'test'
  ...
# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
ok 481 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
  ---
  duration_ms: 545.790908
  type: 'test'
  ...
# Subtest: Settings is a grouped utility index instead of a fifth working house
ok 482 - Settings is a grouped utility index instead of a fifth working house
  ---
  duration_ms: 1.281113
  type: 'test'
  ...
# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
ok 483 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
  ---
  duration_ms: 0.380863
  type: 'test'
  ...
# Subtest: normal APK update view stays human-facing while Web cache status is advanced
ok 484 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 1.037843
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 485 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.381714
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 486 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.305401
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 487 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.186686
  type: 'test'
  ...
1..487
# tests 487
# suites 0
# pass 485
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 43156.395022
```
