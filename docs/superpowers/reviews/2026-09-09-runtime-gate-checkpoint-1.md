# Runtime Gate Checkpoint 1

Execution mode: related-work checkpoint.

Scope of this checkpoint:

- real Greenfield runtime gate adapter;
- real LIGHTHOUSE login surface;
- Recovery Code password reset;
- explicit lock/logout lifecycle;
- no Android/web bundle restructuring yet.

TDD rule: adapter and UI contracts are committed RED before production changes. Review happens only after the whole auth/login/recovery group is green.
