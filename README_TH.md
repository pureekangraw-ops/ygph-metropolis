# YGPH METROPOLIS — One-shot Flat Release

ชุดนี้ทำไว้สำหรับอัปโหลดไฟล์ทั้งหมดลง **root ของ repository** ครั้งเดียว

## วิธีอัปโหลด

1. เข้า repository `pureekangraw-ops/ygph-metropolis`
2. เลือก Add file → Upload files
3. เลือกไฟล์ทั้งหมดในโฟลเดอร์นี้
4. Commit ด้วยข้อความ:

```text
feat: update YGPH Metropolis preview release
```

ไฟล์ทั้งหมดตั้งใจให้อยู่ root ไม่ต้องสร้างโฟลเดอร์ `public`, `tests`, `scripts` หรือ `docs`

## Deployment

Cloudflare/Wrangler ใช้ `wrangler.jsonc` และเสิร์ฟ asset จาก root โดย `.assetsignore` กันไฟล์เครื่องมือออกจากเว็บไซต์

ชุดนี้ใช้ Worker ชื่อ `ygph-metropolis-preview` และยังไม่ทับ Production เดิม
