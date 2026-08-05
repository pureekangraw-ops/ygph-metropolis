# YGPH METROPOLIS — Clean Rebuild Design

สถานะ: รอผู้ใช้ตรวจรับสเปกก่อนเริ่มแผนลงมือ  
วันที่: 2026-08-05  
รีโปใหม่: `pureekangraw-ops/ygph-metropolis`  
รีโปเดิม: `pureekangraw-ops/stock-pocket-big` (Legacy / ห้ามลบ)

## 1. เป้าหมาย

สร้าง YGPH METROPOLIS ใหม่ในรีโปสะอาด โดยย้ายเฉพาะตรรกะที่ผ่านการตรวจจากระบบเดิม ไม่ยกโครง Runtime แบบซ้อนหลายยุคตามมา และไม่ทำให้ข้อมูล IndexedDB/Vault เดิมสูญหายเมื่อสลับใช้งานจริง

หลักผลิตภัณฑ์:

- Four Apps. One Flow.
- แยกเป็นแอป เชื่อมเป็นระบบ
- STORE / RIDE / LEDGER / CALENDAR เป็นโดเมนแยกกัน
- ข้อมูลเชื่อมกันผ่าน Core และ Event/Exchange ที่มีสัญญาชัดเจน
- Offline-first
- โลจิกและความถูกต้องมาก่อนความสวยงาม

## 2. ขอบเขตระยะแรก

ระยะแรกครอบคลุม:

1. แกนข้อมูลและ IndexedDB
2. Vault/การเข้ารหัสที่เข้ากันได้กับข้อมูลเดิม
3. State และ schema compatibility
4. STORE
5. RIDE
6. LEDGER
7. CALENDAR
8. Audit trail
9. Export / Import / Validation
10. PWA, Service Worker และ Offline cache
11. หน้าจอพื้นฐานที่ใช้งานได้จริง

ยังไม่ทำในระยะแรก:

- แผนที่นำทางแบบเรียลไทม์
- การคำนวณกำไร/เส้นทางแบบเรียลไทม์
- ระบบ Cloud sync
- งานตกแต่ง UI ขั้นสูง
- การลบรีโปเดิม

## 3. หลักการย้ายระบบ

- รีโปเดิมถูกตรึงเป็น Legacy reference และ rollback source
- ห้ามคัดลอกไฟล์ Runtime เก่าทั้งก้อน
- อ่านความรับผิดชอบของแต่ละไฟล์เดิม แล้วจัดเป็น Keep / Rewrite / Drop
- ย้ายเฉพาะพฤติกรรมที่มีหลักฐานและทดสอบได้
- ไม่เปลี่ยน DB name, Vault contract หรือ schema โดยไม่มี migration ที่ตรวจสอบได้
- ก่อนแตะข้อมูลจริง ต้องมี backup ที่ทดสอบนำกลับได้
- ระหว่างพัฒนา รีโปใหม่ไม่ Deploy ทับ Production เดิม
- เมื่อพร้อมจึงเปลี่ยน build source ของ Cloudflare ให้รีโปใหม่ Deploy ไป Worker URL เดิม เพื่อรักษา origin และการเข้าถึง IndexedDB เดิม

## 4. สถาปัตยกรรมเป้าหมาย

```text
/src
  /core
    db.js
    vault.js
    state.js
    events.js
    audit.js
    errors.js

  /domains
    /store
    /ride
    /ledger
    /calendar

  /exchange
    export.js
    import.js
    validate.js
    migrate.js

  /ui
    shell.js
    launcher.js
    messages-th.js
    /store
    /ride
    /ledger
    /calendar

/public
  index.html
  manifest.webmanifest
  icons/

/styles
  tokens.css
  app.css

/tests
  /unit
  /integration
  /fixtures

/docs
  /superpowers/specs
```

Build output:

```text
/dist
  index.html
  metropolis.js
  metropolis.css
  sw.js
  manifest.webmanifest
  icons/
```

Cloudflare ต้องเสิร์ฟเฉพาะ `/dist` ไม่สแกนทั้งรีโป

## 5. ขอบเขตความรับผิดชอบ

### Core

รับผิดชอบฐานข้อมูล, Vault, state transitions, event envelope, audit และ error contract โดยไม่ขึ้นกับ UI

### Domains

แต่ละโดเมนมี model, validation, commands และ selectors ของตัวเอง ห้ามแก้ state ของโดเมนอื่นโดยตรง

### Exchange

รับผิดชอบ export/import, evidence schema, validation และ migration ทุก package ต้องตรวจได้ก่อน commit เข้าฐานข้อมูล

### UI

แสดงผลและส่ง command เท่านั้น ห้ามฝังสูตรเงินหรือแก้ IndexedDB โดยตรง

### Service Worker

รับผิดชอบ app-shell caching และ update lifecycle เท่านั้น ห้ามฉีด `<script>` หรือ `<link>` เข้า HTML และห้ามสร้าง Runtime หลายชั้น

## 6. สัญญาข้อมูลหลัก

โดเมนภายในยังคง:

- `store`
- `ride`
- `ledger`
- `calendar`

รายการทุกชนิดต้องมีอย่างน้อย:

- stable id
- createdAt
- updatedAt
- source/owner
- status
- revision หรือ sequence
- audit reference

จำนวนเงินเก็บเป็นจำนวนเต็มหน่วยสตางค์ ห้ามใช้ floating point เป็นแหล่งจริง

การเปลี่ยนสถานะที่มีผลข้ามโดเมนต้องผ่าน event/command ที่ระบุ:

- event type
- source domain
- target domain
- correlation id
- causation id
- timestamp
- payload version

## 7. ความเข้ากันได้กับข้อมูลเดิม

ก่อนเขียน implementation ต้องตรวจจากรีโปเดิมและข้อมูลสำรองจริง:

1. DB name และ object stores
2. `STATE_SCHEMA`
3. key paths และ indexes
4. Vault format
5. PBKDF2 parameters
6. AES-GCM envelope
7. export package versions
8. event/evidence schema
9. date rollover behavior
10. owner/route/status semantics

ผลตรวจต้องออกมาเป็น Compatibility Matrix:

- Compatible — อ่าน/เขียนได้ตรง
- Read-only compatible — อ่านได้ แต่ต้อง migrate ก่อนเขียน
- Migration required
- Unsupported — เก็บไว้ใน Legacy เท่านั้น

## 8. Error handling

- Validation fail: ไม่เขียนข้อมูล
- Import fail: rollback ทั้งชุด
- Migration fail: เปิดโหมด read-only และเสนอ restore
- Vault unlock fail: ไม่เปิดเผยว่ารหัสหรือข้อมูลส่วนใดผิด
- Service Worker update fail: คงเวอร์ชันที่ใช้งานได้ล่าสุด
- Cross-domain event fail: บันทึก audit และไม่ทิ้ง state ครึ่งทาง

ข้อความผู้ใช้ใช้ภาษาไทยที่อ่านง่าย ส่วนรายละเอียดเชิงเทคนิคลง audit log

## 9. การทดสอบ

ต้องมีอย่างน้อย:

### Unit

- สูตรเงินและสตางค์
- validation
- state transitions
- date rollover
- event envelope
- import/export round trip

### Integration

- STORE → LEDGER
- RIDE → LEDGER
- CALENDAR trigger → domain action
- Vault unlock → DB read
- migration fixture จาก schema เดิม
- offline create/update → reload

### Acceptance

- เปิด PWA แบบ offline ได้
- ข้อมูลเดิมยังอ่านได้หลังสลับ Production
- export แล้ว import กลับได้ผลเท่าเดิม
- ไม่มีภาษาไทย mojibake
- ไม่มี UI layer เขียนฐานข้อมูลโดยตรง
- rollback กลับ Legacy deployment ได้

## 10. Deployment และการสลับระบบ

ขั้นพัฒนา:

- รีโปใหม่ใช้ Preview/Development Worker หรือ local build
- Production Worker เดิมยังรับ build จากรีโป Legacy

ขั้นสลับ:

1. freeze Legacy release
2. export และตรวจ backup
3. deploy รีโปใหม่เป็น preview
4. รัน acceptance tests
5. เชื่อมรีโปใหม่กับ Worker เดิม
6. deploy ผ่าน URL เดิม
7. ตรวจ IndexedDB/Vault บนอุปกรณ์จริง
8. เฝ้าดูหนึ่งรอบใช้งานเต็ม
9. เก็บ rollback target ของ Legacy ไว้

ห้ามเปลี่ยน hostname ระหว่าง migration เว้นแต่ยอมรับการย้าย origin โดยชัดแจ้ง

## 11. เกณฑ์เสร็จของ Clean Rebuild ระยะแรก

- Runtime หลักมี JS entry เดียวและ CSS entry เดียว
- ไม่มี dependency ต่อ `flow-era.js`, `flow-era-3.5.js`, `highway-gate.js` หรือ layer wrapper เดิม
- Service Worker ไม่แก้ HTML ตอน runtime
- Core/domain tests ผ่าน
- Compatibility Matrix ครบ
- นำข้อมูลสำรองจริงเข้า environment ทดสอบได้
- เปิดใช้งาน offline ได้
- สลับ Production โดย URL เดิมและข้อมูลเดิมยังเข้าถึงได้
- มี rollback ที่ตรวจแล้ว

## 12. การตัดสินใจที่ล็อกแล้ว

- ใช้รีโปใหม่ `ygph-metropolis`
- เก็บ `stock-pocket-big` เป็น Legacy และไม่ลบ
- รักษา Worker URL เดิมตอน Go-live
- รักษา origin เพื่อเข้าถึง IndexedDB เดิม
- Logic correctness มาก่อน visual polish
- ย้ายแบบตรวจทีละสัญญา ไม่ยกไฟล์เก่าทั้งก้อน

## 13. ขั้นถัดไปหลังผู้ใช้อนุมัติสเปก

1. เขียน Implementation Plan
2. ทำ inventory ของรีโป Legacy
3. สร้าง Compatibility Matrix
4. นิยาม test fixtures จากข้อมูลตัวอย่างและ backup
5. จึงเริ่ม scaffold รีโปใหม่แบบ test-first
