# METROPOLIS Greenfield Business Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Express the owner-visible Store/Ledger/Calendar flows as explicit Greenfield workflows while keeping money ownership in Ledger and Calendar as an Action Hub only.

**Architecture:** Pure workflow builders produce domain commands. Domain-local handlers own each state slice; atomic workflow execution is responsible for all-or-nothing durable commit. Payment workflows coordinate source snapshot update + Ledger cash transaction + Calendar queue progress without granting Calendar money authority.

**Tech Stack:** JavaScript ES modules, Node.js 22 `node:test`.

## Locked Rules

- Sale truth lives in STORE; received cash lives in LEDGER; unpaid amount becomes a CALENDAR action.
- Obligation truth lives in LEDGER; creating an obligation does not move cash.
- Obligation payment is a Ledger cash movement and updates only the matching Calendar queue atomically.
- Previous imported/live snapshots are preserved in entry history before mutable source/queue status changes.
- Installment schedule is explicit input; backend verifies sum == obligation total rather than guessing weekly/monthly policy.

### Tasks

- [ ] TDD cash and receivable sale workflows.
- [ ] TDD receivable payment workflow with STORE history + LEDGER receipt + CALENDAR completion.
- [ ] TDD explicit-installment obligation creation without cash movement.
- [ ] TDD obligation payment workflow with source history + Ledger OUT + matching Calendar update.
- [ ] Reject installment totals that do not exactly match the obligation total.
- [ ] Add business workflow module to syntax gate and run full regression gate.
