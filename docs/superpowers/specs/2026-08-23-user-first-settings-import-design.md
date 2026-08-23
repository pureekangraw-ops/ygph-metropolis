# User-first Settings + One Import Door — Design

## Goal
Make Settings usable without knowledge of METRO internals. The user sees one import entry point, human-readable impact previews, a user-facing update log, normal security controls, and a simple Metro status. Technical diagnostics remain available only behind a collapsed technical section.

## Product truth that must not change
- STORE owns sales, product/stock truth, and store receivables.
- LEDGER owns real cash truth, income/expense, and money obligations.
- CALENDAR owns time/action projection and never manufactures cash truth.
- RIDE owns ride operational truth; only LEDGER records ride cash movements.
- Calendar `COMPLETED` is not evidence of Ledger cash movement by itself.
- Existing atomic workflow/readback rules stay in force.
- Existing Finance Seed, obligation payload, and Greenfield backup handlers remain the internal authorities; the user-facing change is routing and presentation, not replacing proven mutation logic.

## Settings information architecture
Settings is ordered for a normal user:

1. **ข้อมูลของฉัน**
   - `นำเข้าไฟล์`
   - `สำรองข้อมูล`
2. **มีอะไรใหม่**
   - user-facing release/update log
3. **ความปลอดภัย**
   - เปลี่ยนรหัสผ่าน
   - ล็อกแอป
4. **เกี่ยวกับ Metro**
   - เวอร์ชันปัจจุบัน
   - สถานะ: `พร้อมใช้` / `กำลังอัปเดต` / `มีปัญหา`
   - วันที่อัปเดตล่าสุด
5. **ข้อมูลทางเทคนิค** — collapsed by default
   - state revision
   - schema
   - database
   - coordination mode
   - service worker state
   - diagnostics

No technical term above the technical disclosure is required to decide what to press next.

## One Import Door
There is exactly one normal in-app Settings file input: `นำเข้าไฟล์`.

On file selection METRO must:
1. Parse JSON without mutation.
2. Detect the supported document kind itself.
3. Validate using the existing handler contract.
4. Read current state when needed to detect duplicates/conflicts.
5. Render a human impact preview before mutation.
6. Require an explicit confirmation before destructive replacement.
7. Execute through the existing mutation authority.
8. Read back durable state using the existing verifier for that import kind.
9. Tell the user what actually changed.

### Supported kinds in this release
- Greenfield encrypted backup → replacement restore path.
- `YGPH_METRO_FINANCE_SEED` → existing additive Finance Seed path.
- `YGPH_METROPOLIS_RUNTIME_PAYLOAD` / `runtime.obligation` → existing obligation path.

These format names are internal detection keys and are not shown in the normal UI.

### Human preview examples
- Additive Finance Seed: `จะเพิ่ม 2 รายการ`.
- Obligation payload: `จะเพิ่มภาระ 1 รายการ และกำหนดชำระ 2 รายการ`.
- Backup: `ไฟล์นี้จะแทนข้อมูลปัจจุบันทั้งหมด`.

Unsupported/invalid files fail before write with user-facing copy such as `ไฟล์นี้ใช้กับ Metro ไม่ได้`.

## Backup restore behavior
Backup restore remains destructive and keeps the proven verification/rollback boundary.
- Portable backup: verify/decrypt before replacement.
- Legacy backup without embedded recovery key: request the original recovery code only when needed.
- Existing data: show one explicit human confirmation before replacement.
- After restore: re-enrol the current device password against the restored vault key, preserve the current login handoff, then reload and report success.

The locked/recovery entry may keep its emergency recovery controls; the normal Settings surface is the one-door UX target.

## Update Log as release data
The user-facing log is release-owned data, not Git history. Each shipped user-visible feature/fix must include a Thai-language entry explaining what changed or what the user gains.

Latest release entries for 23 Aug 2026:
- ปฏิทินการเงิน — เมื่อกด “จ่ายแล้ว” ระบบจะพาไปบันทึกรายจ่ายด้วย
- รายการที่ปิดไปแล้วแต่ยังไม่มีรายจ่าย สามารถเติมรายจ่ายที่ขาดได้โดยไม่แก้ประวัติปฏิทิน
- นำเข้าไฟล์ — ระบบตรวจไฟล์และเลือกวิธีนำเข้าให้เอง

A release contract test must keep package version, release manifest, service worker release, UI release metadata, release date, and user update log in agreement.

## Service worker / release status
The existing service-worker lifecycle remains the technical source. The user-facing Metro status maps it to only:
- active/controller → `พร้อมใช้`
- installing/waiting/update transition → `กำลังอัปเดต`
- registration failure → `มีปัญหา`

Detailed service-worker wording remains visible only inside `ข้อมูลทางเทคนิค`.

## H SEM correction acceptance scope
When the correction file is eventually exercised through the new flow, verify only the owner-approved delta:
- keep `หนี้คนขาย` at 1,700 baht;
- replace the other 1,700-baht item with `H SEM MOVE` installment 3/4 = 1,373 baht;
- STORE sales/stock, unrelated Calendar records, and unrelated obligations must be unchanged.

This fixture/data is not fabricated by this implementation. Testing against the actual correction file happens only when that file is available.

## Verification boundary
Source/CI success is not production/device verification.
Completion labels must remain separate:
- source implementation
- CI/deploy gate
- main merge
- Cloudflare deployment
- actual device readback

Do not mark a later stage verified from an earlier stage result.
