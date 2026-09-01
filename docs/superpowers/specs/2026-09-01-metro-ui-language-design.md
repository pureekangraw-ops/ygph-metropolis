# METRO UI LANGUAGE — Design

## Goal
Lock one shared body language for Income, Outcome, Calendar, and Ledger before expanding MANUAL further.

Core interaction truth:

**มอง = เห็นสถานะ · แตะ = เข้าเรื่อง · Action หลัก = เด่น · Action รอง = ตามบริบท · ทำสำเร็จ = เห็น Truth ใหม่ทันที**

## Shared Patterns

### List Pattern
- List is the default surface for ordinary records.
- Cards are reserved for important story blocks: targets, ceilings, obligations/attention, and records whose continuing history matters.
- Tapping a row opens its Detail.
- Do not expose Edit / Pay / Cancel / Delete as parallel buttons on every row.
- Status is readable through text/icon semantics and must not depend on color alone.

### Detail Pattern
- One opened record shows current status, amount, date/time, and only the relationships needed to understand it.
- Exactly one context-appropriate Primary Action is visually dominant when the record is actionable.
- Secondary and dangerous actions live behind an intentional secondary area/menu.
- History and related records appear when they help explain the record and do not compete with current truth.

### Action Pattern
- Short actions with a small number of choices use a bottom sheet.
- Durable-truth or high-impact actions require confirmation only when it reduces real error risk.
- Do not use dialogs as the universal action container.
- After commit succeeds, read durable state and update the visible truth immediately.
- Never render success before durable success/readback.

## Forms
Use progressive disclosure. Default fields should be the frequently required values: amount, title, date. Category, note, reference, link, repeat, and special options stay under `รายละเอียดเพิ่มเติม` unless the context genuinely requires them.

Main surfaces are not dashboards and editors at the same time: users first see status/list; `+` or a context action opens the form/sheet.

## Gestures and Buttons
- Tap opens the record.
- Check/swipe are only for safe, reversible, unambiguous actions.
- One Primary Button per context.
- `⋮` owns secondary or accidental-press-sensitive actions.
- Undo is only for easy UI/state reversals.
- Money or committed durable truth uses Reverse / Refund / Amendment, never fake Undo.
- Touch targets must be mobile-safe.
- Loading, disabled, success, and error states are explicit.

## Four-House Application
Income, Outcome, Calendar, and Ledger reuse the same List → Detail → Action interaction grammar. Only data, copy, and the meaning of Complete/settlement vary by house. Existing business/runtime logic remains the authority.

Example receivable flow:
`หนี้ ฿500 · รอรับ` → tap row → Detail → Primary `รับเงิน` → bottom sheet `เต็มจำนวน / บางส่วน` → execute ฿200 → durable readback → `รับแล้ว ฿200 · เหลือ ฿300`.

## Constraints
- Do not change business logic to satisfy UI polish.
- Do not create Functions just to create buttons.
- Do not design four separate interaction languages.
- Reuse existing compatible UI behavior.
- Do not use cards everywhere.
- Do not use dialogs everywhere.
- Do not add a step unless it reduces a real error mode.
- Current MANUAL business capability remains authoritative.

## Completion Gate
The UI round closes when, on each house surface, a user can immediately answer:
1. นี่คืออะไร
2. ตอนนี้สถานะอะไร
3. แตะตรงไหนเพื่อเข้าเรื่อง
4. Action หลักคืออะไร
5. ทำแล้ว Truth เปลี่ยนเป็นอะไร

When all four houses speak the same interaction language and satisfy those five questions, stop UI polishing and return to MANUAL development.
