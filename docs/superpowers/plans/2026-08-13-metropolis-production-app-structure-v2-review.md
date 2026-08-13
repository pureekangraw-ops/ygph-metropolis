# METROPOLIS Production App Structure v2 Plan Review

Status: PASS

- Scope matches owner-approved design: Unlock -> Home -> Store/Ride/Finance/Calendar.
- Security, persistence, Vault, schema, and domain ownership are unchanged.
- Home is attention -> summary -> city doors.
- Settings is a utility outside primary navigation.
- Existing business form IDs and runtime workflow calls are preserved during shell migration.
- RED contract exists in `tests/greenfield-production-shell.test.cjs` before production shell edits.
- GitHub Actions PR Gate is the verification runner because the local clone is unavailable in this environment.
