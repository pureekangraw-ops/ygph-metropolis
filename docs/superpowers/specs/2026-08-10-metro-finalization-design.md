# Metro Finalization Design

Status: OWNER-APPROVED / FINAL FEATURE SET
Date: 2026-08-10

## Goal
Finish Metro's daily-use loop without expanding into a new decision engine.

## Scope
1. Daily target card above the four owner-dashboard metrics. Percent is primary; target amount is secondary. Default pass line is 70%, near line is pass-10, and pass line remains owner-editable.
2. Yesterday comparison shows only factual revenue delta: more/less/equal; no “worth it” verdict.
3. End-day screen summarizes today's earned revenue, real cash in/out, current balance, pending ride credit, and target status.
4. End-day shows up to five open outgoing obligations ordered overdue → due soon (7 days) → later. Locked/stale/VERIFY items remain visible but disabled.
5. Selecting obligations previews total selected and balance after payment without mutating state. Confirmed selections are full-paid in one durable commit; no selection simply closes the day view.
6. Money inputs accept up to two decimal places. Existing integer-satang storage remains authoritative.
7. Move the existing GO exchange card from Home into Settings; preserve the same button IDs/handlers and compact the presentation.
8. Remove decorative descriptions and Home notice copy, but preserve all safety, verification, backup, crypto, and error guidance.
9. Fix light-surface text contrast and remove the Home bottom decorative nub.

## Architecture
- Do not modify STATE_SCHEMA. New target values live as optional settings fields: `dailyTargetSatang` and `dailyPassPercent`.
- Keep `app.js` accounting/source-of-truth behavior unchanged.
- Add one isolated presentation/interaction layer: `metropolis-r5-5.js` + `metropolis-r5-5.css`.
- Load the new layer from the existing `sw-bootstrap.js` Metropolis-layer loader.
- Service worker release becomes 4.2.5 and precaches the new files.
- Derived values (daily percent, yesterday delta, payment preview) are recomputed, never stored as competing truth.

## Safety / YAGNI
- No AI profitability verdict.
- No new report subsystem.
- No duplicate exchange/import path.
- No end-day snapshot record just for pressing “จบวันนี้”.
- No payment of stale/VERIFY items from end-day.
- Multi-payment mutations roll back in memory if any selected item fails before durable commit.
- After this set, feature freeze; future work is bug/pain-driven.
