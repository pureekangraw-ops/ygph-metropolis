# YGG Central Sales Chatbot (`ygph-metropolis`)

เรโปนี้ถูกจัดระเบียบใหม่จากแกน **Lyra / Genome** เพื่อใช้เป็น **แชทบอทกลางสำหรับงานขายและรับบรีฟ** ที่สามารถเพิ่ม **เงื่อนไข (Rules)** และ **ฐานความรู้ (Knowledge)** ได้โดยยังคง Guardrails และความปลอดภัยเดิมครบถ้วน

## โครงสร้างโปรเจกต์

- `src/core/` — Core Engine กลาง (ไม่ผูกติดกับช่องทางแชท)
  - `runtime.mjs` — ตัวคุมรอบการทำงาน, Sanitize ข้อมูลลับ, Output Guardrail (อนุญาตเฉพาะราคาที่มีใน `catalogue`)
  - `policy.mjs` — Policy Engine แบบ Data-Driven รองรับ Custom Rules + Brief Schema
  - `prompts.mjs` — ตัวสร้าง System Prompt พร้อม Anti-Injection และ JSON Contract
  - `knowledge.mjs` — ตัวคัดกรอง `catalogue` / `faq` / `policies` และสกัดราคาที่ยืนยันแล้ว
  - `session.mjs` — Session Store สำหรับเก็บ `brief` และประวัติแชทรายผู้ใช้
  - `provider.mjs` — ตัวเชื่อม OpenAI-compatible HTTPS LLM API
- `src/channels/line.mjs` — LINE Webhook adapter (ตรวจ HMAC-SHA256, กัน event ซ้ำ `EventDeduplicator`, LINE Reply API)
- `src/worker.mjs` — Cloudflare Worker (`GET /health`, `POST /api/chat`, `POST /webhook/line` รองรับ `ctx.waitUntil`)
- `config/default-bot.mjs` — ไฟล์กำหนดเงื่อนไข (`rules`), `briefFields`, และความรู้ (`catalogue`, `faq`, `policies`)
- `tests/` — Automated Tests (`core.test.mjs`, `line-worker.test.mjs`)

## การทดสอบในเครื่อง

ต้องใช้ Node.js v22+ (แนะนำ v24):

```bash
npm run check
npm test
```

## การตั้งค่า Secrets (Cloudflare Worker)

ดูตัวอย่างตัวแปรใน `.dev.vars.example` และตั้งค่าผ่าน Wrangler Secrets ก่อน Deploy:

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LLM_ENDPOINT
npx wrangler secret put LLM_MODEL
npx wrangler secret put LLM_API_KEY
```
