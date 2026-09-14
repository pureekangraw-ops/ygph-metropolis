# LIGHTHOUSE Recovery Contract

Owner-approved baseline for the current recovery round.

## Product shape

- Root navigation: CHAT / MANUAL / SETTINGS only.
- Today lives inside MANUAL.
- Income is the MANUAL parent for money-in and must reach Store / Ride / Other-General income.
- Store and Ride must never become root tabs.
- Calendar is a real working surface, not only a summary card.
- Ledger is durable history/readback/control.
- CHAT must support both mutation and read/list/summary/report intents.
- A read/report intent must not mutate state.
- UI success requires durable persist + readback.
- Legacy HOME root must not return.

## Evidence donors

Historical APKs are capability evidence, not code to bulk-revive:

- 1.0.0 owner build: early owner-facing Store/Ride/Calendar/Ledger shape.
- 1.0.4: expanded Greenfield/intent/Store/Ride layer.
- 1.0.6: richest supplied capability donor.
- 2.0.2: architecture donor for Income/Outcome/Calendar/Ledger and newer readback model.
- current main: runtime/security/build truth.

## Root cause

The regression is primarily a contract-migration error. The rule “Store/Ride are not top-level houses” was encoded too strongly and visible paths disappeared while underlying domain/runtime code survived. CHAT was narrowed to a small mutation parser and lost read/query/report reachability.

## Recovery order

1. Freeze acceptance tests before production changes.
2. Restore Income → Store / Ride / Other using current runtime bridges.
3. Restore evidence-backed Calendar behavior over durable truth.
4. Add read-only CHAT intent contracts separate from mutations.
5. Route reads to durable projections with no write side effects.
6. Run full Greenfield + Android + staging gates.
7. Build owner-signed APK only from verified main.
8. Install-over acceptance must preserve existing data and read installed identity back.

## Anti-regression

CI green is not enough unless the owner-facing acceptance map passes. A domain may be non-root and still must remain reachable. Do not encode absence-from-root as absence-from-MANUAL. Every restored surface needs a visible-path test and a runtime/readback test.