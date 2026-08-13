# YGPH METROPOLIS — Production Shell

**Release:** `5.1.0-functional-rc1`  
**Status:** PRODUCTION  
**Production branch:** `main`

รุ่นนี้คือ Greenfield Production runtime สำหรับการใช้งานประจำ โดยทางเข้าหลักเป็น `LOGIN / HOME` ก่อนเข้าสู่พื้นที่ทำงาน `STORE / RIDE / FINANCE / CALENDAR` ผ่าน Bottom Navigation บนมือถือ ส่วน `SYSTEM` เป็น utility แยกจากเมืองธุรกิจ โดยคง source-of-truth และ persistence contract ของ Greenfield ไว้

## Storage

- State Schema `2`
- Database `ygph-metropolis-greenfield-secure` v1 — ชื่อและฐานเดิมไม่เปลี่ยน
- Vault `ygph-metropolis-greenfield-vault` v1 — รูปแบบเข้ารหัสเดิมไม่เปลี่ยน
- AES-GCM 256-bit + PBKDF2-SHA256 600,000 iterations
- Schema 1 migrate เป็น Schema 2 โดยเพิ่ม `RIDE` ว่างและรักษา STORE / LEDGER / CALENDAR / revision / import metadata เดิม
- ฐานเก่า `stock-pocket-secure` เป็น rollback source เท่านั้น Greenfield ไม่เปิด ไม่เขียน และไม่ลบฐานนี้

## Front-end Flow

- `HOME` เป็น attention/projection layer: แสดงเรื่องสำคัญก่อน ตามด้วย summary ที่ช่วยตัดสินใจ แล้วจึงเป็นประตูเข้าเมือง
- `STORE` และ `RIDE` เป็น working areas โดยตรง ไม่ซ่อนอยู่หลัง top-level `MAKE MONEY` navigation
- `FINANCE` แสดงเงินจริงและภาระ; generated income ที่ยังไม่เป็นเงินจริงไม่เพิ่ม spendable balance
- `CALENDAR` แสดงเวลาและ Action Queue; contextual money actions route กลับไปยัง owner workflow
- `SYSTEM` เป็น utility สำหรับ security, backup/restore และ diagnostics ไม่แข่งขันกับงานประจำใน primary navigation
- Bottom Navigation เปลี่ยน context เท่านั้น ไม่ทำ business mutation

## Domain Ownership

- `STORE` — ความจริงฝั่งร้านและสต็อก; workflow authority ห้าม commit สต็อกติดลบ
- `LEDGER` — เงินจริงและภาระ
- `CALENDAR` — มุมเวลาและ Action Queue ไม่สร้างเงินเอง; `OPEN` และ `PARTIAL` ยัง actionable จนกว่าจะ `COMPLETED` หรือ `CANCELLED`
- `RIDE` — ความจริงเชิงปฏิบัติการของงานวิ่งใหม่; CASH / ค่าใช้จ่าย / การเบิกเครดิตที่เกิดเงินจริง route เข้า LEDGER

Generated income เป็น projection ของรายได้ที่สร้างได้ ไม่ใช่ยอดเงินใช้ได้ ส่วน Daily Goal เก็บเป็น app-plan metadata และไม่เขียนทับ Ledger

## Cutover Evidence

Evidence ตั้งต้นยังคงล็อกที่ `FLOW-1786527289637` source revision `28` แบบ one-time import และยัง **EXCLUDE RIDE** ตาม cutover เดิม ก่อนนำ record เข้า Greenfield ต้องผ่าน FLOW v3 package checksum + event checksum และ Ledger reconciliation. RIDE ใน Schema 2 ใช้สำหรับข้อมูล live ใหม่เท่านั้น

## Release / Publication Contract

`RELEASE_MANIFEST.json` เป็นรายการ production files แบบ exact. `.assetsignore` ต้องตรงกับ manifest โดยไม่มี directory-wide wildcard bypass. Service Worker cache identity ใช้ release + asset revision ที่ถูกตรวจจาก SHA-256 ของ production assets ใน deploy gate ดังนั้นการเปลี่ยน shell asset โดยไม่เปลี่ยน asset revision จะทำให้ CI ล้ม

## Verification

`npm run deploy:gate` รัน Greenfield tests, production syntax และ UTF-8 gate. Pull request ไม่ deploy Production. เมื่อ merge เข้า `main` แล้ว workflow จะรัน safety gate ก่อน deploy Cloudflare Production; client-visible/cache changes ยังต้องตรวจ real-device readbackก่อนปิด defect ที่เกี่ยวข้อง
