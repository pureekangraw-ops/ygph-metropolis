# LIGHTHOUSE User-First Demo Design

**Date:** 2026-09-06  
**Authority:** USER-FIRST PRODUCT PRINCIPLE — OWNER LOCK 2026-09-06, amended by owner decisions through 2026-09-07

## Goal

สร้าง vertical slice สำหรับทดสอบบนมือถือผ่านเว็บก่อนต่อ production truth: PIN → Dashboard → CHAT/pending → MANUAL → Settings โดยทุกข้อมูลใน slice นี้เป็น local/fake state และต้องไม่มี mutation ไปยังข้อมูลจริง

## Product rule

LIGHTHOUSE เป็นแอปที่สร้างให้ผู้ใช้หยิบมาใช้ ไม่ใช่โต๊ะทำงานของ GO และไม่ใช่หน้าจอสำหรับโชว์ architecture. ทุก surface ต้องเริ่มจากคำถามว่า “ผู้ใช้เปิดตรงนี้มาเพื่อทำอะไร และแบบไหนทำให้งานนั้นง่ายที่สุด?”

หลักสำคัญ:

- อย่าออกแบบให้ผู้ใช้ต้องเข้าใจ Metropolis — ออกแบบให้ Metropolis เข้าใจผู้ใช้
- ความซับซ้อนอยู่ข้างใน ความเรียบง่ายอยู่ในมือผู้ใช้
- Backend ownership/routing ต้องซ่อนอยู่หลังภาษาคนและ user task

## Brand DNA

ภาพประภาคารล่าสุดที่ Owner เลือกเป็น **LIGHTHOUSE app icon authority** และเป็น visual DNA ของ demo:

- Dark navy/black foundation
- Warm gold/white beacon เป็นจุดนำสายตาและ primary emphasis
- Cyan / violet / magenta prism accents ใช้เฉพาะ highlight และ transition
- รูปทรงหลัก: lighthouse silhouette, beacon cone, four-point star, path/route line, soft rings
- Visual hierarchy ต้องอ่านง่ายก่อนความอลังการ; ห้ามใช้ glow/gradient จนข้อความหรือ control เสีย contrast
- ความหมายของแบรนด์: เห็นสถานการณ์ → เห็นทางต่อ → ลงมือก้าวถัดไป
- App icon / manifest / PIN branding ต้องอ้างอิง identity เดียวกัน

## Demo scope

### 1. PIN entrance

- หน้าแรกก่อนเข้า app เป็น PIN pad แบบมือถือ
- Demo รับ PIN 4 หลักใดก็ได้เพื่อพิสูจน์ interaction เท่านั้น; ห้ามอ้างว่าเป็น production authentication
- Production authentication/PIN contract ไม่ถูกนิยามโดย demo 4 หลัก
- แสดง LIGHTHOUSE app icon โดยไม่โชว์ architecture/system status
- มี feedback เมื่อกรอกครบและ transition เข้า Dashboard

### 2. Dashboard root

หลัง PIN ต้องเข้า Dashboard โดยตรงและตอบอย่างน้อย:

- เงินจริง
- วันนี้: เงินเข้า / เงินออก / สุทธิ
- ภาระใกล้ที่สุด
- ยังขาด
- เป้าวันนี้

เงินจริงต้องแยกจากเงินคาดว่าจะเข้า. Dashboard ห้ามมีปุ่ม “เปิดแชต” หรือ “เปิด MANUAL” ซ้ำกับ bottom nav.

Dashboard, MANUAL > การเงิน และ MANUAL > ปฏิทิน ต้องอ่านภาระจาก demo state ก้อนเดียวกัน ไม่ใช้ค่า static คนละชุดหรือ script patch แยก.

### 3. Bottom navigation

มี user surface 4 จุดตายตัว:

`หน้าหลัก | แชต | MANUAL | ตั้งค่า`

ห้าม expose Registry, capability, owner, gateway, durable readback, actor, route, manifest หรือชื่อ architecture อื่นบน normal surface.

### 4. CHAT behavior

CHAT เป็นช่องทางภาษาคน ไม่มี GO avatar/persona/online status.

#### Ambiguity Lock B-A-B-A

- Q1 = B: ตอบ side query เฉพาะ capability ที่ตัว demo มีจริง
- Q2 = A: side query ไม่ลบ deep pending; กลับมารอ field เดิม
- Q3 = B: หลังตอบ side query เตือนสั้น ๆ ว่ายังมีรายการเดิมค้าง
- Q4 = A: reload browser แล้ว pending เดิมกลับมา

#### รายรับทั่วไป

รายรับทั่วไปใช้ความหมายขั้นต่ำ:

`จำนวนเงิน + ที่มา`

ตัวอย่าง:

- `ทิป 59` → 59 บาท จากทิป
- `คืนเงิน 120` → 120 บาท จากคืนเงิน
- `ได้เงิน 300 จากเพื่อน` → 300 บาท จากเพื่อน
- `วันนี้ได้ 500` → ถามเฉพาะที่มาของรายรับ

ห้ามบังคับเลือกหมวด ร้าน/วิ่ง/อื่น ๆ และคำว่า `ทิป` ไม่ได้แปลว่า Ride โดยอัตโนมัติ.

#### การขายสินค้าที่รู้จัก

เมื่อมีหลักฐานว่าวลีหมายถึงสินค้าที่ลงทะเบียนแล้ว ให้ route Store แบบซ่อนอยู่หลังบ้าน และล็อกลำดับข้อมูลเป็น:

`สินค้า → มูลค่า → จำนวน`

ตัวอย่าง:

- `ขายมือถือ 566` → สินค้า มือถือ, มูลค่า 566, ถามเฉพาะจำนวน
- `ขายมือถือ 566 2` → มือถือ · 566 บาท · 2 ชิ้น → รอยืนยัน
- `ขายเคสมือถือ 299 3` → เคสมือถือ · 299 บาท · 3 ชิ้น → รอยืนยัน

เลขตัวแรกหลังสินค้าที่พิสูจน์แล้ว = มูลค่าเสมอ; ห้ามตีเป็นจำนวน. Confirmation ต้องแสดง product/value/quantity ก่อน mutation.

ถ้าไม่มีหลักฐานว่าเป็น registered product ให้ยังคงเป็นภาษารายรับทั่วไปได้ ไม่บังคับ Store จากคำว่า “ขาย” เพียงอย่างเดียว.

#### Side query ระหว่าง pending

ระหว่างรายการค้าง ผู้ใช้ถาม `วันนี้วันที่เท่าไร` ได้ ระบบตอบ local date แล้วเตือนสั้น ๆ ว่ารายการเดิมยังรออะไรอยู่ จากนั้นคง pending เดิมต่อ.

### 5. MANUAL user-task hub

จัดจากงานจริง ไม่จัดจาก module. Current visible tasks:

- การเงิน
- ร้านค้า
- งานวิ่ง
- ปฏิทิน
- รายการทั้งหมด

**ภาระไม่เป็น tile แยก** เพราะเป็นส่วนหนึ่งของภาพการเงิน. MANUAL > การเงินต้องรวมเงินจริง, เงินเข้าออก/สุทธิ, ภาระใกล้สุด, กำหนด, ยังขาด และเป้าวันนี้ในมุมมองเดียว.

ทุก tile ที่ visible ต้องกดแล้วเกิดผลใน demo; ถ้า flow ยังไม่มี ให้ไม่แสดงแทนการทำ dead button.

### 6. Store truth proving slice

- registered product sale ใช้ confirmation ก่อน mutation
- sale ที่ยืนยันแล้วอัปเดต cash, today income, stock และ transaction state ก้อนเดียวกัน
- MANUAL > ร้านค้าอ่าน products/transactions ก้อนเดียวกับ CHAT
- MANUAL > รายการทั้งหมดอ่าน transaction เดียวกัน
- ยกเลิก sale ใช้ append-only reversal: คืนเงิน + คืน stock + เก็บ original record และกัน double reversal
- ห้าม hard delete ประวัติการขายเพื่อจำลอง reversal

### 7. Finance/obligation shared truth

Demo state มี obligation fixture ที่เป็น source เดียวของ:

- Dashboard nearest obligation / gap / daily target
- MANUAL > การเงิน
- MANUAL > ปฏิทิน

`ยังขาด` เป็นการเปรียบเทียบ `max(0, obligation amount - real cash)` ดังนั้นเมื่อรายรับ/การขายเพิ่มเงินจริง ค่า gap ต้องขยับตามโดยไม่แก้ static copy แยก.

### 8. Settings

Demo มีเฉพาะงานที่พิสูจน์ UX ได้:

- ข้อมูลเดโม / รีเซ็ตเดโม
- เกี่ยวกับ LIGHTHOUSE
- สถานะว่าเป็นสนามทดสอบ local/fake data

Updater, backup, OS permission และ signer/package verification ไม่จำลองว่า “ผ่านจริง”; หากแสดงในอนาคตต้องแยกชัดว่าเป็น simulation.

## Local state contract

Demo ใช้ state ที่จำเป็นกับ proving slice เท่านั้น เช่น:

- `sessionUnlocked`
- `activeRoot`
- `chatHistory`
- `pendingFlow`
- `manualView`
- `products`
- `obligations`
- `transactions`
- `cash`
- `expectedIncome`
- `todayIncome`
- `todayExpense`

ใช้ localStorage namespace ของ demo เพื่อพิสูจน์ reload continuity เท่านั้น. Production จะเปลี่ยนเป็น service/durable truth owner ตาม Logic Guide.

## Error and recovery

- Input invalid ต้องอธิบายด้วยภาษาคน
- ไม่มี fake success
- ก่อน mutation ที่มีความหมายต้องยืนยันตาม flow ที่กำหนด
- Reset demo ต้องยืนยันก่อนล้าง local demo state
- Reload ขณะมี pending ต้องกู้ state เดิม
- Stock ไม่พอต้องหยุด sale และไม่เปลี่ยนเงินจริง
- Reversal ซ้ำต้องถูกกัน
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

1. PIN 4 หลักใดก็ได้เข้า Dashboard ได้ใน demo
2. Dashboard มีเงินจริง/วันนี้/ภาระ/gap/target และไม่มีทางเข้า CHAT/MANUAL ซ้ำ
3. Bottom nav ทั้ง 4 กดได้จริง
4. รายรับทั่วไปใช้ amount + source และถามเฉพาะ field ที่ขาด
5. registered Store sale ล็อก product → value → quantity และยืนยันก่อน mutation
6. side query ที่รองรับไม่ทำ pending หายและมี reminder หลังตอบ
7. reload แล้ว pending เดิมกลับมา
8. MANUAL มี user tasks ปัจจุบัน 5 ก้อน; ภาระรวมอยู่ในการเงิน
9. Dashboard/Finance/Calendar อ่าน obligation state เดียวกัน
10. Store/History/Finance อ่าน truth state ที่สัมพันธ์กันหลัง sale/reversal
11. normal surface ไม่มี architecture vocabulary ที่ถูกห้าม
12. ทุก visible control มี action หรือไม่ถูกแสดง
13. owner-locked LIGHTHOUSE identity ถูกใช้กับ app icon/manifest/PIN branding
14. staging workflow ผ่านก่อนส่งให้ Owner tap-test บนมือถือ

## Out of scope for this demo

- Production encryption/authentication
- Real durable Ledger mutation
- Real weather/network provider
- Android Back/process death/OS permission
- APK build/sign/install/update
- Production backup/restore truth

สิ่งเหล่านี้ต้องทดสอบใน production/device gates ภายหลัง ไม่ถือว่า simulator ผ่านแทนได้
