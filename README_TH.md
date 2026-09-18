# LIGHTHOUSE — Production Surface

**Repository:** `pureekangraw-ops/ygph-metropolis`  
**Production branch:** `main`  
**Production UI authority:** `LIGHTHOUSE Next`

Repository นี้ยังเป็นเจ้าของ METROPOLIS runtime/backend truth เดิม เช่น Ledger, Store, Calendar, Ride, persistence, Worker และ API แต่ **ไม่ได้ใช้ YGPH METROPOLIS shell เก่าเป็น Production UI อีกต่อไป**

## Single Release Authority

Web และ Android ต้องสร้างจาก builder ตัวเดียว:

```text
scripts/stage-lighthouse-next-bundle.mjs
```

ผลลัพธ์ Production Web อยู่ที่ `.lighthouse-production` และ Android ใช้ wrapper:

```text
android-shell/tools/stage-lighthouse-next.mjs
```

ห้าม deploy repository root โดยตรง และห้ามนำ `ui/lighthouse-shell.mjs`, Home/Store/Ride/Finance shell เก่า หรือ MASTER INPUT surface กลับมาเป็น Production entrypoint

## Production Surface

LIGHTHOUSE มี root สำหรับผู้ใช้ 3 จุด:

- CHAT
- MANUAL
- SETTINGS

ตัว UI อยู่ใน `lighthouse-next/` ส่วน `greenfield/` และ `lighthouse/` บางส่วนยังเป็น runtime/capability dependency ที่ LIGHTHOUSE ใช้จริง แต่ไม่ใช่ UI authority

## GO Client

`/client` เป็น public surface แยกของ GO Client ภายใน deployment เดียวกัน โดยใช้ `client/index.html` ที่ถูกสร้างเข้า canonical bundle โดยตรง ไม่ยืม owner shell เก่า

## Service Worker

Service Worker ถูกสร้างโดย canonical bundle builder และใช้ cache prefix `lighthouse-`. เมื่อ activate จะล้าง cache เก่า prefix `ygph-metropolis-` ด้วย

## Build / Deploy

PR และ main ใช้ `.github/workflows/greenfield-deploy-gate.yml` ชื่อ workflow **LIGHTHOUSE Deploy Gate**:

1. รัน repository tests
2. รัน Android shell tests
3. stage Android จาก canonical builder
4. stage Web Production เป็น `.lighthouse-production`
5. ตรวจว่า legacy shell ไม่หลุดเข้า bundle
6. dry-run Wrangler
7. PR deploy staging
8. main deploy Production

APK owner build ใช้ `.github/workflows/lighthouse-owner-build.yml` และมี gate ปฏิเสธ legacy shell ก่อนสร้าง Android project

## Release / Update

`release/lighthouse-update.json` และ APK release assets เป็นเส้น updater แยกจาก Web deployment. ห้าม activate manifest ชี้ APK ใหม่จนกว่า APK นั้น build/verify/test บนเครื่องจริงและผ่าน Owner Acceptance

## Rollback

source เก่าอาจยังอยู่ใน repository ชั่วคราวเพื่อ rollback/การย้ายออก แต่มีสถานะ **ROLLBACK ONLY — NOT PRODUCTION AUTHORITY**. หลักฐานเก่าถูกเก็บใน Drive archive ก่อน cleanup

## Verification

```bash
npm run deploy:gate
```

การผ่าน CI ไม่เท่ากับ Device Acceptance. งาน Android ปิดได้หลังติดตั้งจริง, อ่าน version/source กลับได้, flow หลักผ่าน และ Owner ยืนยัน acceptance เท่านั้น
