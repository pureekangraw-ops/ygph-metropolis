# INFINITY KNOWLEDGE — Centre Board V1 Design

## Goal

สร้างสัญญากลางของบอร์ดสดใน LIGHTHOUSE เพื่อให้ห้องใหม่อ่านและรับหมุดก่อนทำงาน ห้องเดิมคืนผลพร้อมหลักฐานก่อนออก และสามารถพักงานเป็น Emergency Capsule เมื่อเส้นหลักใช้ไม่ได้ โดยไม่ให้ห้องแชตกลายเป็น source of truth

## Authority and boundaries

- GO Hub/Centre เป็นทางเข้าและทางออกที่บังคับใช้ Work ID
- LIGHTHOUSE เป็นเจ้าของ live Centre Board และ local working-memory truth
- Control Port เป็นเส้นทางเชื่อมและ readback
- Notion รับเฉพาะ COMPLETED/CANCELLED/SUPERSEDED หลังแม่บ้านตรวจในรอบถัดไป
- MIMIR ใช้ค้นประวัติ ไม่เป็น live board authority
- ChatGPT memory ไม่เป็น authority

## Contract units

### Board

บอร์ดหนึ่งชุดเป็น live circulation authority ระยะยาว มี schemaVersion, boardId, workId, revision, updatedAt, pins และ audit

`board.workId` คือ Work ID ที่สร้าง/ถือ authority ของตัว Board และคงที่เพื่อรักษา provenance ของ storage identity

Board ไม่ได้จำกัดให้ทุก Pin ต้องเป็น Work ID เดียวกับ Board อีกต่อไป

### Pin

แต่ละหมุดมี `pinId` และ `workId` ของงานจริงที่กำลังหมุนเวียน พร้อม title, detail, status, ownerEmployeeId, touchedBy, evidence, links, createdAt, updatedAt และ revision

Board เดียวจึงถือหลาย Work ID พร้อมกันได้ โดย CLAIM/RETURN ต้องส่ง Work ID ที่ตรงกับ Pin ที่เลือกทุกครั้ง

สถานะ V1: OPEN, DOING, VERIFY, ARCHIVED, REOPENED, PENDING_RECOVERY

Employee ID ไม่มีทะเบียนถาวรส่วนกลาง ตรวจซ้ำเฉพาะ ID ที่ปรากฏบน live board ปัจจุบัน

### Entry receipt

ห้องเริ่มงานได้เมื่อ:
- ระบุ Work ID ของ Pin ที่จะรับ
- Employee ID ไม่ซ้ำกับผู้ทำงานอื่นบน live board
- ระบุหมุดที่จะ claim
- ทุก Pin ที่ claim มี Work ID ตรงกับ Work ID ที่ส่งมา
- expected board revision ตรงกับ revision ปัจจุบัน

ผลคือ BOARD_READ receipt ซึ่งบันทึก boardRevision และ claimedPinIds

### Return receipt

ห้องออกได้เมื่อ:
- ระบุ Work ID ตรงกับ Pin ที่เคย claim/touch
- แก้เฉพาะหมุดที่ claim/touch
- ส่งผลจริง งานค้าง ขั้นต่อไป และหลักฐาน
- expected board revision ตรง
- อ่านกลับ revision ใหม่สำเร็จ

ผลคือ BOARD_RETURN receipt มิฉะนั้นห้ามถือว่าส่งคืนสำเร็จ

### Revision conflicts

ทุก mutation ใช้ optimistic concurrency หาก expectedRevision ไม่ตรง ให้ error CENTRE_BOARD_REVISION_CONFLICT โดยไม่เปลี่ยนบอร์ด ผู้เรียกต้องอ่านบอร์ดใหม่และตัดสินใจรวมข้อมูล ห้ามเลือกผู้ชนะอัตโนมัติ

### Emergency Capsule

เมื่อ Hub, LIGHTHOUSE หรือ readback ใช้ไม่ได้ ให้หยุด mutation และสร้าง capsule แบบ immutable ซึ่งเก็บ capsuleId, Work ID ของ Pin, Employee ID, base board revision, claimed pins, pending changes, evidence, reason, fingerprint และ PENDING_RECOVERY

Recovery ต้อง:
- อ่าน live board ล่าสุด
- ตรวจ base revision
- ตรวจว่า Work ID ของ capsule ตรงกับ Pin ที่จะคืน
- หากขัดแย้งให้คืน CONFLICT โดยไม่ replay
- หากตรงจึง apply แล้วออก RECOVERY receipt
- ห้ามปิด capsule ก่อน readback สำเร็จ

## Error behavior

ข้อมูลขาดหรือรูปแบบผิดต้อง throw error code คงที่ ห้ามแก้ข้อมูลบางส่วนแล้วค่อย error
- CENTRE_BOARD_WORK_ID_REQUIRED
- CENTRE_BOARD_EMPLOYEE_ID_REQUIRED
- CENTRE_BOARD_EMPLOYEE_ID_CONFLICT
- CENTRE_BOARD_PIN_NOT_FOUND
- CENTRE_BOARD_PIN_WORK_ID_MISMATCH
- CENTRE_BOARD_PIN_NOT_CLAIMED
- CENTRE_BOARD_REVISION_CONFLICT
- CENTRE_BOARD_READBACK_MISMATCH
- CENTRE_BOARD_EMERGENCY_REASON_REQUIRED
- CENTRE_BOARD_RECOVERY_CONFLICT

## Persistence boundary

Board ใช้ identity ของ Board คงที่ใน storage เดิม แต่ Pin ภายในสามารถเป็นคนละ Work ID ได้ การ write ยังคง optimistic revision + exact readback เหมือนเดิม

## Acceptance

- สร้าง Board authority ครั้งเดียวได้
- Board เดียวถือ Pin จากหลาย Work ID ได้
- CLAIM/RETURN ตรวจ Work ID ที่ Pin ไม่ใช่บังคับเท่ากับ Board
- Entry และ Return ออก receipt หลัง revision/readback ถูกต้อง
- mutation ที่ revision เก่าไม่เปลี่ยนบอร์ด
- Work ID ผิด Pin ถูกปฏิเสธแบบ atomic
- Emergency Capsule มี deterministic fingerprint
- recovery ที่ conflict ไม่ replay
- test suite เดิมและ multi-work regression ผ่าน
