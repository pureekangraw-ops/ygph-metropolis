# LIGHTHOUSE CHAT intent branch

This branch isolates CHAT intent interpretation and local slot recovery from MANUAL/runtime ownership.

Verification target:
- production CHAT must call the shared intent interpreter;
- pending repair must use local slot recovery;
- Store mutations remain owned by the existing Store bridge;
- General income mutations remain owned by the existing Ledger bridge;
- no merge to main from this branch without fresh verification evidence.
