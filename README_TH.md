# YGPH METROPOLIS — Greenfield RC

**Release candidate:** `5.0.0-greenfield-rc1`  
**Status:** BRANCH ONLY / NOT PRODUCTION  
**Branch:** `greenfield/metropolis-vnext`

METROPOLIS รุ่นนี้รื้อ runtime เดิมออกจาก working tree และสร้าง backend ใหม่โดยยึด `STORE / LEDGER / CALENDAR` เป็นสาม domain ปัจจุบันเท่านั้น

## Storage

- State Schema `1`
- Database `ygph-metropolis-greenfield-secure` v1
- Vault `ygph-metropolis-greenfield-vault` v1
- AES-GCM 256-bit + PBKDF2-SHA256 600,000 iterations
- ฐานเก่า `stock-pocket-secure` เป็น rollback source เท่านั้น Greenfield RC ไม่เปิด ไม่เขียน และไม่ลบฐานนี้

## Cutover

ข้อมูลตั้งต้นมาจาก Evidence `FLOW-1786527289637` source revision `28` แบบ one-time import เท่านั้น Import ต้องผ่าน reconciliation และ Ledger projection ก่อน durable write; `RIDE` ถูกตัดออกตาม Current semantic scope

## Verification

`npm run deploy:gate` รันเฉพาะ Greenfield tests, production syntax และ UTF-8 gate. Pull request ไม่ deploy Production. การ merge เข้า `main`, Cloudflare Production deploy และ real-device cutover ต้องผ่าน Owner Final Gate ก่อน
