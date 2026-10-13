# Observatory Metropolis integration checklist

Status: plan only; existing feature branch CI failure remains unresolved.

- Observatory consumes Metropolis-authorized read-only Work and checkpoint projections.
- Source of truth stays with each owning system; show source, observedAt, freshness and evidence.
- No independent Work registry or lifecycle command path in Observatory.
- Validate Work Inbox CI, authenticated readback, stale data, revoked access and reconnect behavior.
- Preserve existing read-only functionality until cutover tests and rollback pass.
