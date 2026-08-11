# METROPOLIS 4.2.6 — Root Stabilization Notes

วันที่ตรวจ: 2026-08-11  
วิธีตัดสินใจ: **RULEFORGE — MERGE BEFORE MULTIPLY · EVOLVE BEFORE REPLACE · SPLIT ONLY WHEN AUTHORITY / SCOPE / EFFECT IS TRULY DISTINCT**

## ผลลัพธ์

รอบนี้แก้ที่เจ้าของเดิมของแต่ละความรับผิดชอบ ไม่สร้าง renderer, mutation path, durable queue หรือ global CSS layer คู่ขนาน ระบบยังใช้ State Schema 4, IndexedDB `stock-pocket-secure` version 1, store `kv`, Vault format 1, AES-GCM และ PBKDF2 600000 รอบเหมือนเดิม

| Release authority | ค่าในรุ่นนี้ | เจ้าของ |
|---|---:|---|
| Product ที่ผู้ใช้เห็น | `4.2.6` | `metropolis-r5-5.js` |
| Core/Data | `2.1.5` | `app.js` |
| Highway Gate | `2.0.1` | `highway-gate.js` |
| Service Worker | `v4.2.6-20260811-r24-root-stabilization` | `sw.js` และ `RELEASE_MANIFEST.json` |
| Release manifest | `4.2.6-root-stabilization` | `RELEASE_MANIFEST.json` |

## Owner map จากรากถึงยอด

| ขอบเขต | เจ้าของหลัก | ขอบเขตที่เจ้าของอื่นทำได้ |
|---|---|---|
| State, normalize, base render, durable commit | `app.js` | Extension ใช้ hook/API ที่ประกาศไว้เท่านั้น |
| Invariant, event envelope, protected evidence | `highway-gate.js` | Browser adapter ส่ง proposed state เข้าตรวจ ห้ามแก้ invariant ซ้ำ |
| Calendar render lifecycle | base ใน `app.js`, final lifecycle ใน `flow-era.js` | R5-3 เติมสถานะผ่าน `YGPHRuntime.afterCalendarRender`; ไม่ครอบ renderer ซ้ำ |
| Calendar actions | `queueActionSpecs`, `bindQueueActions`, payment/editor/cancel ใน `app.js` | Schedule manager ดูแลเฉพาะรายละเอียดตารางงวด |
| Store/Obligation form | handler เดิมใน `metropolis-r5.js` และ `metropolis-r5-2.js` | disclosure แค่เปิดช่องเสริม ไม่สร้างคำสั่งบันทึกใหม่ |
| Storage capacity | classifier ใน `metropolis-maintenance-core.js`; commit preflight ใน `app.js` | `metropolis-maintenance.js` แสดงผลและเรียกปุ่มสำรอง/บันทึกเดิม |
| Stock adjustment | pure plan ใน Maintenance core; durable action ใน Maintenance adapter | Highway ตรวจ append-only topology; FLOW/Report อ่าน evidence เดิม |
| Report stock | `calendarReportSnapshot()` ใน `app.js` | Maintenance report รับรู้ `RECONSTRUCTED_V2` และไม่แก้เลขซ้ำ |
| Icon geometry | `metropolis-remaster-core.js` | Remaster adapter hydrate host เดิม; CSS คุมขนาด/สี |
| Final presentation | `metropolis-remaster.css` | แก้ conflict แบบ selector เจาะจง ไม่มี global override layer ใหม่ |

## สิ่งที่แก้และหลักฐานป้องกันการกลับมา

### 1. Production classic-script realm

`metropolis-maintenance-core.js` และ `metropolis-remaster-core.js` อยู่ใน IIFE คนละ lexical scope จึงโหลดตาม production order เดียวกันได้โดยไม่ชน identifier และไม่พึ่ง browser runtime globals ใน pure core

- Prevention: `tests/runtime-composition.test.cjs`
- หลักฐาน: production manifest โหลดครบโดยไม่มี captured runtime error

### 2. Calendar lifecycle และสถานะสามสี

การกดวัน, filter, ลูกศรเดือน, clear day และ FLOW swipe กลับเข้าวงจรเดียวกัน ทุก card มี `data-queue-id` คงที่ สถานะใช้เขียว/เหลือง/แดงชุดเดียว: completed = เขียว, open/verify/partial ที่ยังไม่เลยกำหนด = เหลือง, เลยกำหนด = แดง และ cancelled ไม่แสดงแต่ยังอยู่ใน durable history

- Prevention: `tests/calendar-runtime-lifecycle.test.cjs`, `tests/metropolis-status-signal.test.cjs`
- ครอบคลุม direct day, filter, month navigation และ swipe

### 3. Queue เหลือสามคำสั่ง

คิวที่ยังทำงานใช้ `จ่าย/รับ/ดำเนินการ`, `แก้ไข`, `ยกเลิก` รวมสามปุ่ม การจ่ายจำนวนเท่ายอดคงเหลือถือว่าจ่ายครบ จำนวนที่น้อยกว่าถือว่าจ่ายบางส่วน หน้าแก้ไขรวมแผน/วัน/ตารางงวด และซ่อนประวัติไว้ใน disclosure คิวที่ completed เหลือดูประวัติเท่านั้น

- Prevention: `tests/queue-actions-runtime.test.cjs`
- ไม่มี mutation owner ชุดที่สองใน FLOW หรือ R5-2

### 4. Progressive forms

Store ซ่อนค่าจัดส่ง, ลูกหนี้, ช่องทางติดต่อ, วันนัด และหมายเหตุจนผู้ใช้ติ๊กดูเพิ่ม ส่วนภาระซ่อนหมายเหตุและ preview ตารางงวดไว้ก่อน การเปิด/ปิดช่องไม่เปลี่ยน stock, cash, receivable หรือ schedule semantics

- Prevention: `tests/progressive-forms-runtime.test.cjs`, `tests/store-shipping.test.cjs`

### 5. การทับถมของข้อมูลและป้องกันพื้นที่ล้น

ข้อมูลประวัติสำคัญเป็น append-only ได้แก่ Store sources/adjustments, Ride history, Ledger transactions/obligations, Calendar, Audit และ Event envelopes ระบบไม่ลบหรือยุบหลักฐานอัตโนมัติ เพราะจะทำลาย source link, reversal และ read-back proof

| ระดับ | projected usage / quota | การทำงาน |
|---|---:|---|
| `NORMAL` | ต่ำกว่า 70% | ใช้งานปกติ สีเขียว |
| `WATCH` | 70% ถึงต่ำกว่า 85% | เตือนให้สำรองสม่ำเสมอ สีเหลือง |
| `WARNING` | 85% ถึงต่ำกว่า 95% | แนะนำสำรองและเพิ่มพื้นที่ สีแดง |
| `CRITICAL` | ตั้งแต่ 95% | เตือนก่อนเพิ่มข้อมูลจำนวนมาก สีแดง |
| write block | projected bytes ตั้งแต่ quota | หยุดก่อนเขียน; durable state เดิมไม่เปลี่ยน |

Settings แสดงขนาด Vault, browser usage/quota และจำนวน evidence พร้อมใช้ปุ่มส่งออก backup/บันทึกเดิม หาก browser ไม่ให้ estimate จะแสดง `UNKNOWN` โดยไม่เดาข้อมูล ถ้า preflight หรือ `QuotaExceededError` ล้มเหลว ระบบคืน Vault/State เดิมและตรวจ read-back ก่อนแจ้งผู้ใช้ ไม่มี destructive cleanup อัตโนมัติ

- Prevention: `tests/storage-capacity.test.cjs`, `tests/persistence.test.cjs`

### 6. Stock adjustment และ report

การปรับสต็อกบันทึก `beforeQty`, signed `adjustmentQty`, `afterQty`, reason, note, actor และเวลา โดยไม่สร้าง Ledger transaction และไม่เปลี่ยน stock value ยกเว้นกรณีจำนวนหลังปรับเป็นศูนย์ตาม invariant เดิม Highway บล็อกการลบ/แก้ evidence เก่าและ duplicate identity

Report ใช้ durable current stock เป็น anchor แล้วย้อน/เดินด้วย signed movements ของ purchase, return, sale, restored sale, withdrawal และ adjustment วันที่สร้างคิวแยกจากวันครบกำหนด และ pending ณ วันสิ้นรายงานพิจารณา created/completed/cancelled time จริง

- Prevention: `tests/stock-adjustment-runtime.test.cjs`, `tests/core-safety.test.cjs`, `tests/report-semantics.test.cjs`, `tests/metropolis-maintenance.test.cjs`

### 7. Durable single-flight

ทันทีที่ commit เริ่ม `#appShell` ได้ `aria-busy="true"` และปุ่มที่มีชีวิตทุกปุ่มถูก disable ก่อน async boundary โดย `WeakMap` จำ disabled state เดิมไว้ `finally` คืนสถานะทั้งกรณีสำเร็จและล้มเหลว ส่วน `durableCommitInProgress` ยังเป็น programmatic authority เดิม ไม่มี mutation queue ใหม่

Purchase-return ถูกตรวจจากรากแล้วว่าขยับ source revision ครั้งเดียว จึงคงโค้ดเดิมและเพิ่ม regression lock แทนการแก้สิ่งที่ไม่เสีย

- Prevention: `tests/durable-ui-guard.test.cjs`

### 8. Visual/cascade และเฟือง Settings

Remaster ใช้ `.flow-icon` เดิมของปุ่ม Settings แล้ว hydrate geometry ใหม่ จึงเหลือ SVG เดียว ไม่สร้างเฟืองซ้อน glyph 20px สี secondary อยู่ใน hit box 48×48px กฎสุดท้ายยังปิด pale surfaces ของ cash rows, Ride report, schedule preview, Gate, Calendar swipe และ Maintenance controls ด้วย selector เจาะจง ปุ่ม swipe/maintenance อย่างน้อย 44×44px และ label nav ไม่ถูกย่อต่ำกว่า `.62rem`

- Prevention: `tests/metropolis-remaster.test.cjs`

## Bug records

| Symptom | Root cause | Fix | Prevention/Test |
|---|---|---|---|
| เปิด production scripts แล้วชน declaration | pure extension cores ประกาศ top-level identifier ใน classic realm เดียวกัน | ห่อ core ด้วย IIFE และคง public API เดิม | runtime composition |
| Calendar เปลี่ยนหน้าแล้วสี/ปุ่มหลุดหรือ render ซ้ำ | wrapper และ post-render หลายชั้นไม่มี lifecycle owner เดียว | route ทุก entry เข้ารอบ FLOW final lifecycle + hook bus | calendar runtime lifecycle |
| ปุ่มคิวซ้ำ จ่ายเต็ม/บางส่วนแยกเป็นหลายคำสั่ง | UI action ถูกตกแต่งซ้ำในหลาย layer | action spec เดียวใน app และ payment modal เดียว | queue actions runtime |
| ฟอร์มยาวและช่องเหตุผล/รายละเอียดรบกวนงานหลัก | optional fields เปิดตลอด | disclosure ใน handler เดิม | progressive forms runtime |
| ใช้งานนานแล้วไม่เห็นพื้นที่ใกล้เต็ม | ไม่มี capacity classifier/preflight ที่ commit boundary | Settings capacity + projected write preflight + rollback | storage capacity |
| ปรับสต็อกแล้ว evidence อาจถูกแก้ย้อนหลัง | adjustment ยังไม่อยู่ใน protected topology ครบ | append-only invariant และ exchange/report evidence | core safety + stock runtime |
| รายงานสต็อกย้อนหลังเป็นศูนย์หรือแก้ซ้ำ | ใช้ transaction history เป็นฐานและ Maintenance correction ไม่รู้ basis ใหม่ | reconstruct จาก durable anchor พร้อม `RECONSTRUCTED_V2` | report semantics |
| กดสองปุ่มเร็วแล้ว memory mutation ที่สองเกิดก่อน guard ปฏิเสธ | programmatic guard เริ่มหลัง handler เปลี่ยน shared state | disable UI ก่อน async boundary และคืน state ใน finally | durable UI guard |
| เฟืองหัวแอปดูใหญ่/ซ้อน | FLOW มี icon host อยู่แล้วแต่ Remaster prepend host ใหม่ | reuse FLOW host ลบ duplicate และย่อ glyph | remaster runtime regression |
| สีระดับความจุไม่เปลี่ยน | CSS อ้าง token `--metro-success/--metro-warning` ที่ไม่มี | ใช้ `--metro-primary/--metro-gold/--metro-danger` ที่เป็น authority จริง | remaster token regression |

## Verification evidence

- New root runtime suites: **21/21 PASS**
- Full repository tests: **172/172 PASS**
- Production JavaScript syntax: **PASS**
- UTF-8: **32 production text assets + RELEASE_MANIFEST.json PASS**
- Release strings: product/Core/Highway/SW/manifest ตรงตามตารางด้านบน
- State Schema/DB/Vault identifiers: **unchanged**
- `LOCAL_VISUAL_RENDER=BLOCKED_NO_BROWSER`

ค่ารุ่นเก่าที่เหลือหลัง audit เป็นหลักฐานโดยตั้งใจ: `YGPH v2.0.0` ใน migration provenance, cache r21/r19 ใน maintenance cleanup fixtures และ `2.0.0` ที่เป็นช่วงเวอร์ชันของ npm dependencies ไม่ใช่ current release authority

JSDOM ตรวจ runtime composition, DOM ownership, action behavior และ regression contract แล้ว แต่ไม่ใช้แทนการอ่านภาพบนอุปกรณ์จริง

## Physical-device checklist — ยังต้องอ่านกลับหลังเผยแพร่

- [ ] Unlock/reload/offline เข้า Home ได้และรายงาน Service Worker r24 ตรง
- [ ] Home, Store, Ride, Ledger, Calendar และ Settings ไม่มี pale-on-pale หรือข้อความหลักถูกตัด
- [ ] เฟือง Settings เล็กลงแต่แตะง่าย; capacity card และปุ่ม backup/persist ตอบสนอง
- [ ] Calendar กดวัน, filter, ลูกศรเดือน และ swipe คงเขียว/เหลือง/แดง; cancelled ไม่แสดง
- [ ] คิวเข้าและคิวออกอย่างละหนึ่งรายการมีสามปุ่ม; ยอดสูงสุดปิดครบและยอดน้อยกว่าบันทึกบางส่วน
- [ ] Sale/Obligation disclosures เปิดเฉพาะเมื่อเลือกและบันทึก semantics เดิม
- [ ] Stock adjustment อยู่หลัง reload, เข้า exchange/report และไม่สร้าง Ledger transaction
- [ ] ส่งออก backup จริงก่อนทดลองสถานะพื้นที่สูง; รุ่นนี้ไม่มี destructive cleanup อัตโนมัติ
