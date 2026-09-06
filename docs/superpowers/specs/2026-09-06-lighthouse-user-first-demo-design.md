# LIGHTHOUSE User-First Demo Design

**Date:** 2026-09-06  
**Authority:** USER-FIRST PRODUCT PRINCIPLE — OWNER LOCK 2026-09-06

## Goal

สร้าง vertical slice สำหรับทดสอบบนมือถือผ่านเว็บก่อนต่อ production truth: PIN → Dashboard → CHAT/pending → MANUAL → Settings โดยทุกข้อมูลใน slice นี้เป็น local/fake state และต้องไม่มี mutation ไปยังข้อมูลจริง

## Product rule

LIGHTHOUSE เป็นแอปที่สร้างให้ผู้ใช้หยิบมาใช้ ไม่ใช่โต๊ะทำงานของ GO และไม่ใช่หน้าจอสำหรับโชว์ architecture. ทุก surface ต้องเริ่มจากคำถามว่า “ผู้ใช้เปิดตรงนี้มาเพื่อทำอะไร และแบบไหนทำให้งานนั้นง่ายที่สุด?”

## Brand DNA

ใช้ภาพประภาคาร LIGHTHOUSE เป็น visual DNA ไม่ใช่ layout template:

- Dark navy/black foundation
- Warm gold/white beacon เป็นจุดนำสายตาและ primary emphasis
- Cyan / violet / magenta prism accents ใช้เฉพาะ highlight และ transition
- รูปทรงหลัก: lighthouse silhouette, beacon cone, four-point star, path/route line, soft rings
- Visual hierarchy ต้องอ่านง่ายก่อนความอลังการ; ห้ามใช้ glow/gradient จนข้อความหรือ control เสีย contrast
- ความหมายของแบรนด์: เห็นสถานการณ์ → เห็นทางต่อ → ลงมือก้าวถัดไป

## Demo scope

### 1. PIN entrance

- หน้าแรกก่อนเข้า app เป็น PIN pad แบบมือถือ
- Demo รับ PIN 4 หลักใดก็ได้เพื่อพิสูจน์ interaction เท่านั้น; ห้ามอ้างว่าเป็น production authentication
- แสดง LIGHTHOUSE brand โดยไม่โชว์ architecture/system status
- มี feedback เมื่อกรอกครบและ transition เข้า Dashboard

### 2. Dashboard root

หลัง PIN ต้องเข้า Dashboard โดยตรงและตอบอย่างน้อย:

- เงินจริง
- วันนี้: เงินเข้า / เงินออก / สุทธิ
- ภาระใกล้ที่สุด
- ยังขาด
- เป้าวันนี้

เงินจริงใน fixture ต้องแยกจากเงินคาดว่าจะเข้า. Dashboard ห้ามมีปุ่ม “เปิดแชต” หรือ “เปิด MANUAL” ซ้ำกับ bottom nav.

### 3. Bottom navigation

มี user surface 4 จุดตายตัว:

`หน้าหลัก | แชต | MANUAL | ตั้งค่า`

ห้าม expose Registry, capability, owner, gateway, durable readback, actor, route, manifest หรือชื่อ architecture อื่นบน normal surface.

### 4. CHAT behavior

CHAT เป็นช่องทางภาษาคน ไม่มี GO avatar/persona/online status.

Demo ต้องพิสูจน์ Ambiguity Lock:

- Q1 = B: ตอบ side query เฉพาะ capability ที่ตัว demo มีจริง
- Q2 = A: side query ไม่ลบ deep pending; กลับมารอ field เดิม
- Q3 = B: หลังตอบ side query เตือนสั้น ๆ ว่ายังมีรายการเดิมค้าง
- Q4 = A: reload browser แล้วกู้ pending เดิมกลับมา

Fixture หลัก:

`วันนี้ได้ 500` → ถามที่มา → `ร้าน` → `ขายสินค้า` → ถามชื่อสินค้า → รอจำนวน

ระหว่างรอจำนวน ผู้ใช้สามารถถาม side query ที่ demo รองรับ เช่น `วันนี้วันที่เท่าไร` แล้วระบบตอบจาก local date จากนั้นเตือนสั้น ๆ ว่า “ยังรอจำนวนของ <สินค้า> อยู่” และกลับไปทำรายการเดิมต่อได้.

### 5. MANUAL user-task hub

จัดจากงานจริง ไม่จัดจาก module:

- การเงิน
- ภาระ
- ร้านค้า
- งานวิ่ง
- ปฏิทิน
- รายการทั้งหมด

ทุก tile ที่ visible ต้องกดแล้วเกิดผลใน demo; ถ้า flow ยังไม่มี ให้ไม่แสดงแทนการทำ dead button.

### 6. Settings

Demo มีเฉพาะงานที่พิสูจน์ UX ได้:

- ข้อมูลเดโม / รีเซ็ตเดโม
- เกี่ยวกับ LIGHTHOUSE
- สถานะว่าเป็นสนามทดสอบ local/fake data

Updater, backup, OS permission และ signer/package verification ไม่จำลองว่า “ผ่านจริง”; หากแสดง ให้ติดป้ายว่า simulation เท่านั้น.

## Local state contract

- `sessionUnlocked`
- `activeRoot`
- `demoFinance`
- `chatHistory`
- `pendingFlow`
- `manualView`

ใช้ localStorage เฉพาะ demo เพื่อพิสูจน์ Q4/reload continuity. Production จะเปลี่ยนเป็น service/durable truth owner ตาม Logic Guide.

## Error and recovery

- Input invalid ต้องอธิบายด้วยภาษาคน
- ไม่มี fake success
- Reset demo ต้องยืนยันก่อนล้าง local demo state
- Reload ขณะมี pending ต้องกู้ state เดิม
- UI failure ต้องกลับ root ที่ปลอดภัยได้

## Responsive/accessibility

- Mobile-first ที่ 320px ขึ้นไป
- Touch target อย่างน้อย 44px
- input font อย่างน้อย 16px
- ไม่มี horizontal page scroll
- Bottom nav ไม่บัง content
- reduced-motion ลด animation/glow motion
- สีไม่ใช่ signal เดียว; ใช้ข้อความ/รูปทรงร่วมด้วย

## Demo acceptance

1. PIN 4 หลักใดก็ได้เข้า Dashboard ได้
2. Dashboard มี 5 คำตอบหลักและไม่มีทางเข้า CHAT/MANUAL ซ้ำ
3. Bottom nav ทั้ง 4 กดได้จริง
4. CHAT fixture เดินถึง deep pending ได้
5. side query ที่รองรับไม่ทำ pending หายและมี reminder หลังตอบ
6. reload แล้ว pending เดิมกลับมา
7. MANUAL ไม่มี raw module registry และไม่มี dead button
8. normal surface ไม่มี architecture vocabulary ที่ถูกห้าม
9. ทุก visible control มี action หรือถูก disabled พร้อมเหตุผล
10. เปิดบน staging URL แล้วใช้งานด้วยนิ้วบนมือถือได้

## Out of scope for this demo

- Production encryption/authentication
- Real Ledger mutation
- Real weather/network provider
- Android Back/process death/OS permission
- APK build/sign/install/update
- Backup/restore truth

สิ่งเหล่านี้ต้องทดสอบใน production/device gates ภายหลัง ไม่ถือว่า simulator ผ่านแทนได้
