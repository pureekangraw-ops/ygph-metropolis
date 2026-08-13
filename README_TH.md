# YGPH METROPOLIS — Functional Shell RC

**Release candidate:** `5.1.0-functional-rc1`  
**Status:** BRANCH ONLY / NOT PRODUCTION  
**Branch:** `productization/functional-shell-v1`

รุ่นนี้ต่อยอด Greenfield runtime ให้กลับมาเป็นแอปใช้งานประจำ โดยคง source-of-truth เดิมและแยกหน้าบ้านเป็น `HOME / MAKE MONEY / CALENDAR / FINANCE / SYSTEM` พร้อม Right Thumb Rail สำหรับมือถือ

## Storage

- State Schema `2`
- Database `ygph-metropolis-greenfield-secure` v1 — ชื่อและฐานเดิมไม่เปลี่ยน
- Vault `ygph-metropolis-greenfield-vault` v1 — รูปแบบเข้ารหัสเดิมไม่เปลี่ยน
- AES-GCM 256-bit + PBKDF2-SHA256 600,000 iterations
- Schema 1 migrate เป็น Schema 2 โดยเพิ่ม `RIDE` ว่างและรักษา STORE / LEDGER / CALENDAR / revision / import metadata เดิม
- ฐานเก่า `stock-pocket-secure` เป็น rollback source เท่านั้น Greenfield ไม่เปิด ไม่เขียน และไม่ลบฐานนี้

## Domain Ownership

- `STORE` — ความจริงฝั่งร้านและสต็อก
- `LEDGER` — เงินจริงและภาระ
- `CALENDAR` — มุมเวลาและ Action Queue ไม่สร้างเงินเอง
- `RIDE` — ความจริงเชิงปฏิบัติการของงานวิ่งใหม่; CASH / ค่าใช้จ่าย / การเบิกเครดิตที่เกิดเงินจริง route เข้า LEDGER

MAKE MONEY เป็น projection ของรายได้ที่สร้างได้ ไม่ใช่ยอดเงินใช้ได้ ส่วน Daily Goal เก็บเป็น app-plan metadata และไม่เขียนทับ Ledger

## Cutover Evidence

Evidence ตั้งต้นยังคงล็อกที่ `FLOW-1786527289637` source revision `28` แบบ one-time import และยัง **EXCLUDE RIDE** ตาม cutover เดิม RIDE ใน Schema 2 ใช้สำหรับข้อมูล live ใหม่เท่านั้น ไม่มีการนำ RIDE เก่าจาก Evidence เข้ามาเงียบ ๆ

## Verification

`npm run deploy:gate` รัน Greenfield tests, production syntax และ UTF-8 gate. Pull request ไม่ deploy Production. PR นี้ต้องผ่าน Gate และ Owner Final Gate ก่อน merge เข้า `main`; หลัง merge จึงค่อยตรวจ Cloudflare และ real device อีกครั้ง
