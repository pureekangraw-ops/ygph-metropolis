# Mobile Flow Cleanup v1 — Design

Base: main @ 1a56156e7d2203f1b84159b3b2a5b6ef815f330d
Owner approval: execute through Gate.

Order: App Shell -> Calendar obligation flow -> Settings.

## App Shell
- Keep fixed bottom nav and mint active state.
- Remove sticky behavior from empty appStatus; hide it when empty.
- Give workspace content bottom padding including safe-area-inset-bottom.
- No overlay above the nav may cover content.

## Calendar
- First-surface actions: payment/complete + Edit. No direct Cancel.
- Edit opens centered native dialog.
- Edit v1 changes due date only; title/amount stay read-only.
- Add CALENDAR-owned reschedule workflow/command. Reject closed records, validate YYYY-MM-DD, update dueDate through existing history/provenance path only.
- Cancel lives inside Edit and requires a second destructive confirmation; safe Back action receives initial focus.
- Cancel continues to use existing CALENDAR status workflow and never creates money truth.

## Settings
- Gear opens centered settings dialog, not a system page.
- Show three visible sections without nested details: Security; Backup/Restore; System.
- Preserve existing auth/recovery/runtime element IDs and logic.
- SYSTEM remains a utility, not bottom navigation.

## Invariants
No Ledger amount, obligation amount, payment history, Vault, schema, or backup-format changes.

## Acceptance
Bottom content is unobscured; Calendar Edit/reschedule/cancel works end-to-end; Settings is a centered flat dialog; existing contracts remain green; npm run deploy:gate must pass.
