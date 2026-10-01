# PRISM — Single Android Release Route

**Repository:** `pureekangraw-ops/ygph-metropolis`

## เส้นทางเดียว

`.github/workflows/prism-owner-build.yml` เป็น workflow เดียวสำหรับตรวจและสร้าง Android release:

1. Checkout SHA ของ PR/event แบบตรงตัว และตรวจ SHA กลับ
2. ตรวจ syntax, repository contracts และ PRISM native contracts
3. ตรวจ Android shell contracts
4. Stage PRISM ด้วย `scripts/stage-prism-native.mjs` และปฏิเสธ legacy parent
5. Generate Android, apply version/icon/map/password/browser/security และตรวจ merged manifest
6. Build release แล้ว sign ด้วย canonical PRISM signer
7. ตรวจ final APK package/version/signer พร้อม hash และ source provenance
8. Upload `prism-release.apk` พร้อม identity/security evidence และ IP notice

ไม่มี Native Gate แยก ไม่มี debug/unsigned APK ให้ดาวน์โหลด และไม่มี LIGHTHOUSE build/deploy/updater route บน branch นี้
Unsigned APK ระหว่าง build เป็นไฟล์ชั่วคราวก่อน sign ภายใน job เดียว

Workflow รันสำหรับ PR ที่เปลี่ยนส่วนเกี่ยวข้อง, push เข้า main และ manual dispatch โดยใช้ SHA ของ event ไม่ checkout ปลาย branch ที่เคลื่อนต่อไป

## ตรวจในเครื่อง

```bash
npm run prism:gate
npm --prefix android-shell install --no-audit --no-fund
npm --prefix android-shell test
```

Source ของระบบเดิมและ regression tests บางส่วนยังอยู่เพื่ออ้างอิง แต่ไม่ใช่เส้น build/deploy ของ PRISM ตัว packager LIGHTHOUSE เดิมปฏิเสธการเรียก CLI
การถอด workflow ไม่ได้ลบหรือเปลี่ยน Worker ที่เคย deploy ไปแล้ว

## Acceptance

CI ที่ผ่านพิสูจน์การ build และ identity/provenance ของ signed APK เท่านั้น
ยังต้องตรวจ Android เครื่องจริง: install-over owner.20, password setup/unlock, Browser launch, Factory Eye boot/pair, inactive watch observation และ GO Hub readback
ก่อนยืนยัน install-over ต้องอ่าน package/version/signer ของ baseline จริงกลับมาได้
