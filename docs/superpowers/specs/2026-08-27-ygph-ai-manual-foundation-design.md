# YGPH AI + Manual Foundation Design

Status: DESIGN APPROVED — B2 / WRITTEN SPEC FOR REVIEW
Date: 2026-08-27

## 1. เป้าหมาย

ทำให้ YGPH กลับมาเป็น **Yggdrasil Personal Helper** ในรูปที่สอดคล้องกับการใช้งานจริง:

`คน → AI → เกทส่งออก → ภาษาแอป → เกท Manual → พื้นที่ใช้งาน → logic เดิมที่เหมาะ → readback → แสดงผล`

รอบ Foundation ไม่ทำทุกอย่างให้ครบ เป้าคือวางฐานให้ถูกตำแหน่ง โตต่อได้ และพิสูจน์เส้นทางง่ายหนึ่งเส้นให้ผ่านจริง

## 2. หลักที่ใช้ตัดสินใจ

- มองภาพรวมของ flow ก่อนมองเป็นไฟล์หรือ module
- เริ่มจาก Reality ของการใช้งาน ไม่เริ่มจากของเดิมว่าต้องรักษาอะไร
- ของเดิมที่ช่วยโครงใหม่จริง ใช้ต่อ
- ของเดิมที่ทำให้ต้องอ้อม ซ้ำ หรือบวม ตัดหรือแทนได้
- ของที่ดีแต่ไม่เหมาะ ไม่จำเป็นต้องเพิ่ม
- Safety ต้องอยู่ตรงความเสี่ยงจริง ไม่ตรวจเรื่องเดียวกันซ้ำหลายชั้น
- ความครบไม่ใช่เป้าหมายของรอบฐาน
- Logic งานจริงยังอยู่ฝั่ง Application / Manual และ Runtime เดิมตรงที่มันเหมาะ

## 3. ภาพรวม B2

```text
คน
 ↓
AI PAGE
รับคำพูด → ตีความความหมาย
 ↓
┌──── AI OUTPUT GATE ────┐
│ วุ้นแปลภาษา            │
│ แปล / จัดรูป / ตรวจว่า │
│ “ส่งออกได้ไหม”         │
└─────────↓───────────────┘
       APP LANGUAGE
            ↓
┌──── MANUAL GATE ───────┐
│ ดูว่า “กระจายไปไหน”   │
│ ตัวกระจายงาน           │
└─────────↓───────────────┘
     MANUAL AREAS
 INCOME / OUTCOME / LEDGER / CALENDAR
            ↓
     EXISTING RUNTIME
            ↓
 WORKFLOW / COMMAND ENGINE
            ↓
       DATA + READBACK
```

Gate สองฝั่งไม่ทำงานซ้ำกัน:

- **เกทส่งออก AI** ตอบว่า: `ของนี้แปลเป็นภาษาแอปแล้วส่งออกได้ไหม?`
- **เกท Manual** ตอบว่า: `ก้อนภาษาแอปนี้กระจายไปไหน?`

เมื่อเข้า Manual area แล้ว วงจรภายในทำงานต่อเอง ไม่ย้อนกลับไปใช้ตัวกระจายเป็นผู้จัดการ business logic

## 4. หน้า AI — สร้างใหม่

หน้าที่หลัก:

`คำพูด → ตีความ → ส่งความหมายเข้าเกทส่งออก`

หน้า AI เป็น chat-first และต้องทำให้เห็นพอประมาณว่า:

1. รับอะไรเข้ามา
2. เข้าใจว่าอะไร
3. กำลังส่งความหมายอะไรไปที่เกท

AI ไม่ต้องรู้รายละเอียดว่าภายใน Manual หรือ Runtime จะทำงานร่วมกันอย่างไร

## 5. เกทส่งออก AI — มีวุ้นแปลภาษาอยู่ข้างใน

หน้าที่หลัก:

`ความหมายจาก AI → วุ้นแปลภาษา → ภาษาแอปมาตรฐาน → ตรวจว่าส่งออกได้ไหม → ส่งออก`

วุ้นแปลภาษาเป็น **Dictionary + Normalizer + Validator แบบเล็ก**

ตัวอย่าง:

- `expense / รายจ่าย / outcome` → `OUTCOME`
- `65 บาท` → `6500 satang`
- ชื่อ field ต่างกัน → field มาตรฐานของแอป
- วันที่ / เวลา → รูปมาตรฐานเดียวกัน

เกทส่งออกไม่ทำ business logic และไม่มี state ธุรกิจของตัวเอง ถ้าแปลไม่ได้หรือ contract ไม่ผ่าน ให้หยุดตรงนี้ ไม่เดาเอง

## 6. ภาษาแอป — Foundation Contract

Foundation ใช้ contract เล็กที่สุดที่พิสูจน์ flow ได้

```json
{
  "version": "1",
  "action": "CREATE",
  "target": "OUTCOME",
  "fields": {
    "title": "ข้าว",
    "amountSatang": 6500
  }
}
```

- `version` = รุ่นของภาษาแอป
- `action` = ต้องการทำอะไร
- `target` = พื้นที่ใช้งานที่ต้องส่งเข้า
- `fields` = ข้อมูลที่งานนั้นต้องใช้

ภาษาแอปไม่ผูกกับหน้า AI และต้องสามารถป้อนเข้าเกท Manual โดยตรงในการทดสอบได้

## 7. เกท Manual — มีตัวกระจายงานอยู่ข้างใน

หน้าที่หลัก:

`App Language → อ่าน target → กระจายไปพื้นที่ Manual ที่ถูก`

ตัวกระจายงานเป็นจุดส่งต่อ ไม่ใช่ business engine

ตัวอย่าง:

- `target: INCOME` → พื้นที่ INCOME
- `target: OUTCOME` → พื้นที่ OUTCOME
- `target: LEDGER` → พื้นที่ LEDGER
- `target: CALENDAR` → พื้นที่ CALENDAR

ถ้าไม่มีปลายทางที่รู้จัก ให้หยุดตรงตัวกระจายและรายงานว่าไม่มีปลายทางนั้น

เกท Manual **ไม่กลับไปตรวจความหมายหรือ contract ซ้ำกับเกทส่งออก** และไม่ทำ logic แทนพื้นที่ปลายทาง

## 8. หน้า Manual — ฐานที่คนเห็น

พื้นที่ฐานชุดแรก:

- INCOME
- OUTCOME
- LEDGER
- CALENDAR

พื้นที่เหล่านี้เป็น **พื้นที่ใช้งาน / audit surface** ไม่จำเป็นต้องเท่ากับ Domain ใต้ระบบแบบ 1:1

โครงต้องเพิ่มหรือลดพื้นที่ในอนาคตได้โดยไม่ต้องรื้อทั้งหน้า

Manual ไม่ใช่จอแสดงผลของ AI และไม่ใช่ fallback ต่อให้ไม่มี AI ผู้ใช้ยังต้องเข้ามาทำงาน ตรวจ และควบคุมงานจาก Manual ได้

หลังงานเข้าพื้นที่แล้ว logic ภายใน Manual / Runtime ค่อยวิ่งสัมพันธ์กันเองตามของจริง

## 9. สิ่งที่ใต้ระบบบอกเรา

Runtime ปัจจุบันมี Domain จริงคือ:

- STORE
- LEDGER
- CALENDAR
- RIDE

B2 **ไม่สร้าง INCOME / OUTCOME เป็น Domain ใหม่** ใน Foundation

เหตุผล:

- INCOME มีทางลงเครื่องเดิมผ่าน `runtime.otherIncome()`
- OUTCOME มีทางลงเครื่องเดิมผ่าน `runtime.expense()`
- ทั้งสองทางใช้ workflow ที่ลง LEDGER และมี validation/readback เดิมรองรับอยู่แล้ว

ดังนั้น:

```text
INCOME  = Manual area → existing income workflow → LEDGER
OUTCOME = Manual area → existing expense workflow → LEDGER
```

**LEDGER เป็นเครื่องจริงข้างใต้** ส่วน INCOME/OUTCOME เป็นพื้นที่ทำงานที่คนเห็นและใช้

STORE / RIDE ยังอยู่ใต้ระบบใน Foundation เพราะมี logic และข้อมูลที่ยังใช้ได้ แต่ **ไม่จำเป็นต้องขึ้นเป็นพื้นที่หลักบน Manual รอบฐาน**

ถ้า Reality ภายหลังบอกว่าไม่ต้องการจริง ค่อยตัด ไม่ให้สิทธิ์รอดเพียงเพราะเป็นของเดิม

## 10. Logic ภายใน Manual / Runtime

ของเดิมที่ควรเก็บเพราะมีประโยชน์จริง:

- Runtime session bridge
- Runtime methods ที่ตรงกับ use case ใหม่
- business workflows ที่ทำให้หลายส่วนขยับร่วมกันแบบ atomic
- command engine
- domain validation
- durable readback
- test suite เดิมที่คุม regression

ตัวอย่างของจริงใต้ระบบ:

- การรับเงินลูกค้าสามารถทำให้ STORE + LEDGER + CALENDAR ขยับร่วมกัน
- การจ่ายภาระสามารถทำให้ LEDGER + CALENDAR ขยับร่วมกัน

นี่คือวงจรภายในที่ B2 ต้อง **ใช้ประโยชน์** ไม่สร้างตัวกระจายงานตัวใหม่มาคุมซ้ำ

## 11. Safety — วางให้ตรงชั้น

ไม่สร้าง safety ซ้ำทุกจุด

- **เกทส่งออก** กันความหมาย/รูปภาษาแอปที่ไม่พร้อมส่ง
- **เกท Manual** เลือกปลายทาง ไม่ทำ validation ธุรกิจซ้ำ
- **Runtime / command / domain layer** ตรวจความถูกต้องของงานจริง เช่น domain, command type, revision, duplicate, payload, amount และ state ของแต่ละงาน

หลักคือ:

`เกทบนกันภาษาผิดหรือส่งผิดทาง → เครื่องล่างกันงานผิดจริง`

## 12. ของเดิมที่ไม่มีสิทธิ์รอดอัตโนมัติ

- Master Input UI เดิม
- Master Input router ในรูปปัจจุบัน
- Home แบบปัจจุบัน
- top navigation แบบ Store / Ride / Finance
- การจัดหน้าเดิมที่ผูกกับเมืองเก่า

ถ้าชิ้นใดต้องสร้าง adapter หลายชั้นหรือข้อยกเว้นเพื่อให้มันอยู่ต่อ ให้พิจารณาตัด/แทน มากกว่าปะเพิ่ม

## 13. ลำดับทำงาน — 3 Track แยกเทส

### Track 1 — AI Foundation

สร้างหน้า AI ใหม่แบบขั้นต่ำ

ต้องพิสูจน์ว่า:

- รับข้อความธรรมชาติได้
- interpreter ตีความได้
- ส่งความหมายเข้า Output Gate ได้

Acceptance:

`ข้าว 65` → AI เข้าใจว่าเป็นรายจ่ายชื่อข้าว 65 บาท

### Track 2 — Manual Foundation

สร้าง Manual shell ให้เหลือฐาน INCOME / OUTCOME / LEDGER / CALENDAR

ต้องพิสูจน์ว่า:

- ป้อน App Language เข้า Manual Gate โดยไม่ผ่าน AI ได้
- ตัวกระจายส่งเข้า OUTCOME ถูก
- OUTCOME ต่อเข้า existing `runtime.expense()` ได้
- readback และผลที่แสดงตรง

### Track 3 — Gate-to-Gate Foundation

ต่อ:

`AI → Output Gate[วุ้น] → App Language → Manual Gate[ตัวกระจาย] → Manual area`

ต้องพิสูจน์ว่า:

- วุ้นแปลชื่อ / หน่วย / field ได้ตรง
- Output Gate ไม่ปล่อย contract ที่ส่งออกไม่ได้
- ความหมายไม่เปลี่ยนกลางทาง
- Manual Gate กระจาย target ถูก
- error ของ AI / Output Gate / Manual Gate / Runtime แยกจากกันได้

## 14. Acceptance Slice แรก

ใช้คำสั่งเดียวก่อน:

`ข้าว 65`

เส้นทางจริง:

```text
คน
→ AI: เข้าใจ “รายจ่าย ข้าว 65”
→ Output Gate / วุ้น
→ CREATE / OUTCOME / ข้าว / 6500 satang
→ Manual Gate
→ OUTCOME
→ runtime.expense()
→ expense workflow
→ LEDGER transaction: OUT / EXPENSE / 6500
→ readback
→ Manual แสดงผลตรง
```

ผ่านเมื่อ:

1. AI เข้าใจถูก
2. Output Gate แปลและปล่อย App Language ถูก
3. Manual Gate กระจายเข้า OUTCOME ถูก
4. OUTCOME ต่อเข้า logic เดิมที่เหมาะได้
5. Runtime ทำงานถูกใน isolated/test state
6. readback ตรงกับสิ่งที่เกิดขึ้น
7. หน้า Manual แสดงผลตรง

Foundation ไม่เขียนข้อมูล production จริงในการพิสูจน์รอบแรก ใช้ isolated/test state ก่อน

## 15. UI รอบฐาน

### AI

มีเท่าที่จำเป็น:

- พื้นที่บทสนทนา
- ช่องพิมพ์
- สถานะสั้น ๆ ตอนตีความ
- preview ความหมาย / App Language ที่กำลังส่ง

### Manual

มีเท่าที่จำเป็น:

- INCOME / OUTCOME / LEDGER / CALENDAR
- พื้นที่รายการ/ผลหลัก
- Audit เล็ก ๆ ว่า App Language ถูกกระจายไปไหน และผล readback คืออะไร
- ปุ่มเฉพาะที่ต้องใช้พิสูจน์ vertical slice

Gate ไม่มีหน้าหลักของตัวเอง ถ้าต้อง debug ให้เห็นเฉพาะ input/output/destination ที่จำเป็น

## 16. Settings

ยังไม่แตะในรอบนี้

กลับมาหลัง AI + Manual + Gate-to-Gate Foundation ผ่านแล้ว ให้ Reality ตอนนั้นเป็นตัวบอกว่า Settings ต้องถืออะไร

## 17. ชื่อและภาพรวม

ชื่อฐานของแอป:

**YGPH — Yggdrasil Personal Helper**

METROPOLIS ยังเป็นชื่อโลก/ประวัติของระบบได้ แต่ไม่บังคับ UI หรือ flow ใหม่ให้เดินตามการแบ่งเมืองเดิม

## 18. สิ่งที่ตั้งใจไม่ทำใน Foundation

- ไม่ rewrite business logic ทั้งหมด
- ไม่เพิ่ม INCOME / OUTCOME เป็น Domain ใหม่
- ไม่ลบ STORE / RIDE ใต้ระบบเพียงเพราะไม่ขึ้นหน้า Foundation
- ไม่ขยาย AI ให้รองรับทุกคำสั่ง
- ไม่ทำ Dashboard เต็ม
- ไม่ทำ Settings ใหม่
- ไม่ทำทุกปุ่มของ Manual
- ไม่สร้าง Gate ให้กลายเป็น business engine
- ไม่เพิ่ม safety ซ้ำกับ Runtime โดยไม่มีความเสี่ยงใหม่รองรับ
- ไม่เปลี่ยน production current pointer จนกว่าจะมี device acceptance

## 19. ทางเลือกที่พิจารณา

### A — ปะ Master Input เดิมเข้ากับหน้าปัจจุบัน
เร็ว แต่ลากโครงเก่าและความซ้ำต่อไป — ไม่เลือก

### B — สร้าง surface/gate ใหม่ แต่ตีความ INCOME/OUTCOME เป็นโครงใหม่ลึกถึง Domain
สะอาดบนผิว แต่ขยาย schema/command/migration โดยไม่จำเป็น — ไม่เลือก

### B2 — สร้างหน้าใหม่ + Gate ใหม่สองฝั่ง + Manual areas ใหม่ แต่ต่อเข้ากับ Runtime/Workflow เดิมตรงที่มันเหมาะ
ได้ flow ใหม่โดยไม่ทิ้งเครื่องยนต์ที่ยังดี และไม่สร้างชั้นซ้ำ — **APPROVED**

### C — Rewrite ทั้งแอป
สะอาดบนกระดาษ แต่เสี่ยงทิ้ง logic และบทเรียนที่ยังมีค่าเกินจำเป็น — ยังไม่ควรทำ

## 20. Stop Condition ของ Foundation

หยุดเพิ่มของเมื่อ vertical slice `ข้าว 65` ผ่านครบตั้งแต่ AI จนถึง readback/แสดงผล

หลังจากนั้นประเมิน Reality ใหม่ แล้วค่อยเปิด Full House Phase สำหรับ AI และ Manual ทีละส่วน
