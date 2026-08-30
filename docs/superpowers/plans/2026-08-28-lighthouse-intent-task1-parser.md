# LIGHT HOUSE Intent Task 1 Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement only Task 1 of the approved Intent phase: split command groups, preserve raw UTF-16 spans, distinguish target/quantity/money, and read the S01–S12 number forms without executing PATH or Runtime work.

**Architecture:** Add a pure intermediate parser under `lighthouse/` rather than widening `pattern-input.mjs` or PATH v1. `intent-number.mjs` owns Thai/Arabic numeric decoding and strict money validation; `intent-parser.mjs` owns quote protection, group boundaries, target/number slots, and recovery status. Output remains interpretation-only and never mutates Runtime.

**Tech Stack:** Node.js 22, ECMAScript modules, `node:test` / `node:assert`.

**Spec:** `LIGHT-HOUSE-INTENT-PHASE-1-ENGINEERING-2026-08-28.md` sections 3–4 and S01–S12; Notion `งานช่าง — ตัดคำและอ่านจำนวน`.

## Global Constraints

- Scope is Task 1 / S01–S12 only.
- Do not modify PATH v1, Runtime, persistence, time, condition, AI recovery, or vocabulary-learning behavior.
- Preserve original `rawText`; spans are UTF-16 start-inclusive/end-exclusive offsets into it.
- Do not silently round money with more than two decimal places.
- Do not turn malformed comma forms such as `1,50` into a valid amount.
- Do not guess between two unlabelled numbers such as `ข้าว 2 65`.
- Quoted/reference text such as `คำว่า “ข้าว 65” หมายถึงอะไร` must not become an executable command group.
- No deploy and no production mutation.

---

### Task 1: Lock S01–S12 as RED tests

**Files:**
- Create: `tests/greenfield-lighthouse-intent-parser.test.cjs`

**Interfaces:**
- Consumes: planned `parseIntentTask1(rawText)` from `lighthouse/intent-parser.mjs`.
- Produces: executable acceptance examples S01–S12.

- [ ] Write tests that assert: S01 one group and 6500 satang; S02 two non-crossed groups; S03 first group prohibited and second group active; S04 one group; S05 Thai number words = 65; S06 Thai digits decimal = 6550; S07 comma thousands = 150000; S08 recovery/no money; S09 quantity 2 + money 6500; S10 ambiguous/recovery; S11 precision invalid/recovery; S12 reference/no command groups.
- [ ] Run `node --test tests/greenfield-lighthouse-intent-parser.test.cjs` in an isolated local fixture and verify RED because `lighthouse/intent-parser.mjs` does not exist.
- [ ] Commit the RED tests before production parser code.

### Task 2: Implement strict numeric decoding

**Files:**
- Create: `lighthouse/intent-number.mjs`
- Test: `tests/greenfield-lighthouse-intent-parser.test.cjs`

**Interfaces:**
- Produces: `parseNumericText(rawValue)` returning `{ state, value, amountSatang, kind }` without mutating input.
- Supports Arabic digits, Thai digits, valid thousands commas, up to two decimal places, and Thai number words needed by Task 1.

- [ ] Add the smallest numeric parser needed by S05–S11.
- [ ] Reject malformed grouping, non-positive money, unsafe integers, and money precision >2 instead of normalizing them silently.
- [ ] Keep plain number meaning separate from unit/role assignment; role is assigned by the command parser.

### Task 3: Implement Task 1 command grouping and slots

**Files:**
- Create: `lighthouse/intent-parser.mjs`
- Modify: `package.json` only if syntax-gate registration is required for the new modules.
- Test: `tests/greenfield-lighthouse-intent-parser.test.cjs`

**Interfaces:**
- Produces: `parseIntentTask1(rawText)` -> `{ status, rawText, groups }`.
- Each group carries stable `groupId`, original `rawSpan`, original group text, `prohibited`, and slots with `slotId`, `role`, `rawSpan`, `rawValue`, `resolvedValue`, and `state`.

- [ ] Protect quoted/reference text before command segmentation.
- [ ] Segment known short expense forms without using a connector word alone as proof of a new group.
- [ ] Preserve target and number homes inside each group; never pair an amount from one group with another.
- [ ] Assign explicit unit roles (`กล่อง` -> quantity, `บาท` -> money); infer money only for the recognized short target+amount recording form.
- [ ] Return `RECOVERY_REQUIRED` for malformed/ambiguous numeric regions without inventing values.
- [ ] Run the S01–S12 test file until GREEN.
- [ ] Run syntax checks for the new modules.

### Task 4: Regression checkpoint and handoff

**Files:**
- No additional production scope.

- [ ] Re-run the Task 1 tests from a clean checkout/fixture.
- [ ] Compare the feature branch to `main`; confirm only the Task 1 parser, tests, plan, and necessary syntax-gate registration changed.
- [ ] Update Notion with branch, commit SHAs, observed RED/GREEN evidence, and any test limitation.
- [ ] Stop after Task 1. Do not begin Task 2–4 of the broader Intent phase without a new checkpoint.