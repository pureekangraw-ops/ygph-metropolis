# LIGHT HOUSE — PATH Foundation Owner Amendment

Status: OWNER-APPROVED AMENDMENT  
Date: 2026-08-28  
Owner / Final Authority: BIG  
Applies to: `docs/superpowers/specs/2026-08-28-lighthouse-path-foundation-design.md`

## Input Adapter Independence

The PATH foundation must remain easy to fit with AI later without rebuilding the foundation.

Locked rules:

- Input Adapters are replaceable peer adapters. Pattern, AI, Manual, API, and Automation may all normalize into the same PATH Contract.
- `source` is provenance only. It records where a normalized request came from; it MUST NOT grant routing or execution authority.
- Path Kernel selects a route from the normalized Required Result and current legal capabilities, not from `source`.
- PATH must not import, call, or structurally depend on a specific Pattern/AI/Manual adapter.
- The first Pattern adapter (`ข้าว 65`) is only a deterministic proof fixture for the PATH skeleton, not the architectural primary input.
- Adding AI later must mean attaching another adapter before PATH. AI must not require changes to Path Kernel, Direct Path authority, Runtime authority, Reality/Readback, or Closure contracts.
- AI/Gem output must still pass deterministic PATH Contract validation before any capability can execute.

Required architectural invariant:

```text
Pattern ─┐
AI      ─┼→ Normalized Request + Required Result → PATH → Capability → Runtime → Reality / Readback / Closure
Manual  ─┤
API     ─┤
Auto    ─┘
```

Changing the input source must not change the legal execution path merely because the source changed.
