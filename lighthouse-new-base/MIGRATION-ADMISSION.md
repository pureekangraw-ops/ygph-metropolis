# LIGHTHOUSE NEW BASE — Migration Admission

Current owner truth is the NEW BASE product shape. Old UI/navigation never enters by convenience.

## KEEP / ADAPT / REJECT

| Candidate | Decision | Why / boundary |
| --- | --- | --- |
| `greenfield/runtime.mjs` | KEEP core contract | Proven high-level mutation/readback facade. NEW BASE may borrow the app-owned Runtime; it does not inherit old UI. |
| `greenfield/business-workflows.mjs` | KEEP behind Runtime | Proven business rules stay behind the Runtime owner. NEW BASE does not call persistence directly. |
| `greenfield/master-input-router.mjs` | ADAPT | Useful prepare/execute/readback logic, but internal statuses and old object scope must be translated before reaching CHAT. |
| `master-input/intent-contract.mjs` | ADAPT | Useful gated interpretation contract. It is not CHAT identity and does not define the final vocabulary/owner model. |
| `lighthouse/pattern-input.mjs` + path/capability core | ADAPT first slice | Proven deterministic `ข้าว 65` expense path with durable readback. Admit only as a behavior bridge; do not import old product structure. |
| legacy `ui/`, old app shell/navigation, popup/Finance-hosted Calendar assumptions | REJECT | Conflicts with current `CHAT | MANUAL | SETTINGS` and `Income | Outcome | Calendar | Ledger` product truth. |

## Admission rule

A candidate crosses into NEW BASE only after a NEW BASE failing behavior test proves why it is needed. The admitted adapter must expose owner-oriented behavior and human-facing results; legacy route/UI/state ownership never crosses with it.
