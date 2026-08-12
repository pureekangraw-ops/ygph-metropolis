from pathlib import Path
import re

path = Path("app.js")
text = path.read_text(encoding="utf-8")
original = text


def replace_once(pattern: str, replacement: str, label: str):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one replacement, got {count}")


open_editor = r'''function openQueueEditor(id) {
  const item = findQueue(id);
  if (!item) return toast("ไม่พบคิว");
  if (["COMPLETED", "CANCELLED"].includes(item.status)) return showHistory(id);
  const source = findSource(item.source, item.sourceId);
  const displayName = item.displayName || source?.name || source?.customer || source?.note || "";
  const note = item.note || item.reviewNote || item.verifiedNote || "";
  const scheduleApi = globalThis.YGPHMetropolisSchedule;
  const hasSchedule = Boolean(scheduleApi?.isManagedQueue?.(id) || source?.scheduleMode === "PER_INSTALLMENT");
  const history = queueHistoryMarkup(item);
  openModal({
    title: "แก้ไข",
    text: "แก้ข้อมูลแผนและวันกำหนด โดยยอดเงินจริงยังยึดข้อมูลต้นทาง",
    body: `<div class="form-grid queue-editor">
      <div class="field full"><label>ชื่อที่ใช้แสดง</label><input id="queueEditName" maxlength="100" value="${esc(displayName)}"></div>
      <div class="field"><label>วันกำหนด</label><input id="queueEditDue" type="date" value="${esc(item.due)}"></div>
      <div class="field full"><label>หมายเหตุ</label><input id="queueEditNote" maxlength="180" value="${esc(note)}"></div>
      <div class="field full"><label><input id="queueEditReminder" type="checkbox" ${item.reminderEnabled !== false ? "checked" : ""}> แสดงในสิ่งที่ต้องจัดการ</label></div>
      ${hasSchedule ? '<div class="field full"><button type="button" class="secondary-btn wide" id="queueScheduleManager">จัดการตารางงวด</button></div>' : ""}
      <div class="field full"><details id="queueEditHistory" class="queue-edit-history"><summary>ประวัติ</summary><div class="history-modal">${history}</div></details></div>
      <div class="field full"><div class="flow-note"><b>ยอดตามต้นทาง ${money(Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)))} บาท</b><br>ช่องแก้ไขนี้ไม่เขียนทับยอดเงินจริง</div></div>
    </div>`,
    confirm: "บันทึก",
    onConfirm: async () => {
      const due = byId("queueEditDue").value;
      if (!validISODate(due)) { toast("ตรวจวันกำหนด"); modalBusy = false; return; }
      const commandId = uid("CMD");
      const idempotencyKey = `${item.id}:edit:${Date.now()}`;
      const payload = {
        queueId: item.id,
        displayName: cleanImportText(byId("queueEditName").value, 100),
        due,
        note: cleanImportText(byId("queueEditNote").value, 180),
        reminderEnabled: byId("queueEditReminder").checked
      };
      closeModal();
      await YGPHDomainCommands.execute({ type: "CALENDAR_EDIT_QUEUE", commandId, idempotencyKey, payload });
    }
  });
  const scheduleButton = byId("queueScheduleManager");
  if (scheduleButton) scheduleButton.onclick = () => {
    const api = globalThis.YGPHMetropolisSchedule;
    if (!api?.openManager) return toast("ระบบตารางงวดยังไม่พร้อม");
    api.openManager(item.id);
  };
}'''

open_payment = r'''async function openPayment(id) {
  const item = findQueue(id);
  const source = findSource(item.source, item.sourceId);
  withGates(item, async () => {
    const incoming = item.actionType === "RECEIVE_CUSTOMER_PAYMENT";
    const maximum = incoming ? Number(source.outstandingSatang || 0) : Math.min(Number(source.remainingSatang || 0), Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)));
    if (maximum <= 0) return toast("รายการนี้ไม่มียอดคงเหลือ");
    openModal({ title: incoming ? "รับเงินลูกค้า" : `จ่ายภาระ${item.installmentNumber ? ` งวด ${item.installmentNumber}/${item.installmentCount}` : ""}`, text: "ยอดสูงสุดถูกกรอกไว้แล้ว ลดจำนวนเมื่อต้องการทำบางส่วน", body: `<div class="field"><label>ยอดครั้งนี้</label><input id="payAmount" type="number" min="0.01" max="${satangToBaht(maximum)}" step="0.01" value="${satangToBaht(maximum)}"></div>`, confirm: incoming ? "รับเงิน" : "จ่ายเงิน", onConfirm: async () => {
      const amount = parseMoneyToSatang(byId("payAmount").value, { allowZero: false, label: "ยอดครั้งนี้" });
      if (amount <= 0 || amount > maximum) { toast("ยอดไม่ถูกต้อง"); modalBusy = false; return; }
      const sequence = item.history.filter(h => h.event === "PAYMENT_APPLIED").length + 1;
      const legacyActionKey = `payment:${sequence}:${amount}`;
      const commandId = uid("CMD");
      closeModal();
      await YGPHDomainCommands.execute({
        type: "CALENDAR_PAY_QUEUE",
        commandId,
        idempotencyKey: `${item.id}:${legacyActionKey}`,
        payload: { queueId: item.id, amountSatang: amount, legacyActionKey }
      });
    }});
  });
}'''

complete_queue = r'''async function completeQueue(id) {
  const item = findQueue(id); const source = findSource(item.source, item.sourceId);
  withGates(item, async () => openModal({ title: item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" ? "ยืนยันว่าเงินเข้าแล้ว" : "ยืนยันแอคชัน", text: `${sourceLabel(item.source)} · ${actionLabel(item.actionType)}`, body: `<div class="flow-note"><b>ยอด:</b> ${money(item.amountSatang)} บาท</div>`, confirm: "ดำเนินการ", onConfirm: async () => {
    const commandId = uid("CMD");
    closeModal();
    await YGPHDomainCommands.execute({
      type: "CALENDAR_COMPLETE_QUEUE",
      commandId,
      idempotencyKey: `${item.id}:complete`,
      payload: { queueId: item.id }
    });
  }}));
}'''

cancel_queue = r'''async function cancelQueue(id) {
  const item = findQueue(id); const source = findSource(item.source, item.sourceId);
  if (item.status === "CANCELLED") return toast("รายการนี้ยกเลิกแล้ว");
  openModal({ title: "ยกเลิกรายการ", text: "ระบบจะย้อนเฉพาะผลที่เคยเกิดจากคิวนี้", body: `<div class="flow-note"><b>${item.source}/${item.sourceId}</b><br>${actionLabel(item.actionType)}</div>`, confirm: "ยืนยันยกเลิก", onConfirm: async () => {
    const commandId = uid("CMD");
    closeModal();
    await YGPHDomainCommands.execute({
      type: "CALENDAR_CANCEL_QUEUE",
      commandId,
      idempotencyKey: `${item.id}:cancel`,
      payload: { queueId: item.id, reason: "ยกเลิกจาก Calendar" }
    });
  }});
}'''

verify_balance = r'''function promptVerifyBalance(migrationPrompt = false) {
  const initialVerification = migrationPrompt || !state.ledger.balanceVerified;
  openModal({ title: initialVerification ? "ยืนยันยอดเงินปัจจุบันหลังย้ายข้อมูล" : "กระทบยอดเงินปัจจุบัน", text: initialVerification ? "ตั้งฐานเงินครั้งแรกหลัง Migration เท่านั้น" : "ระบบจะสร้างรายการปรับยอด ณ เวลานี้ โดยไม่เปลี่ยนประวัติย้อนหลัง", body: `<div class="field"><label>เงินปัจจุบัน</label><input id="verifiedBalance" type="number" min="0" step="0.01" value="${state.ledger.balanceVerified ? satangToBaht(currentBalanceSatang()) : 0}"></div>${initialVerification ? "" : '<div class="field"><label>เหตุผลส่วนต่าง</label><input id="balanceReason" maxlength="180" placeholder="เช่น ตรวจเงินสดและยอดบัญชีแล้ว"></div>'}`, confirm: initialVerification ? "ยืนยันยอดตั้งต้น" : "บันทึกรายการปรับยอด", onConfirm: async () => {
    const targetSatang = parseMoneyToSatang(byId("verifiedBalance").value, { allowZero: true, label: "เงินปัจจุบัน" });
    const reason = initialVerification ? "" : cleanImportText(byId("balanceReason").value, 180);
    if (!initialVerification && reason.length < 3) { toast("ระบุเหตุผลการปรับยอด"); modalBusy = false; return; }
    const commandId = uid("CMD");
    closeModal();
    await YGPHDomainCommands.execute({
      type: "LEDGER_RECONCILE_BALANCE",
      commandId,
      idempotencyKey: `balance-reconciliation:${Date.now()}`,
      payload: { targetSatang, initialVerification, reason }
    });
  }});
}'''

replace_once(r'function openQueueEditor\(id\) \{.*?\n\}\n\nasync function openPayment', open_editor + '\n\nasync function openPayment', "openQueueEditor")
replace_once(r'async function openPayment\(id\) \{.*?\n\}\n\nasync function completeQueue', open_payment + '\n\nasync function completeQueue', "openPayment")
replace_once(r'async function completeQueue\(id\) \{.*?\n\}\n\nasync function cancelQueue', complete_queue + '\n\nasync function cancelQueue', "completeQueue")
replace_once(r'async function cancelQueue\(id\) \{.*?\n\}\n\nfunction showHistory', cancel_queue + '\n\nfunction showHistory', "cancelQueue")
replace_once(r'function promptVerifyBalance\(migrationPrompt = false\) \{.*?\n\}\n', verify_balance + '\n', "promptVerifyBalance")

# Replace only the live Add Debt UI handler. Import/migration obligation creation remains with its validated import owner.
replace_once(
    r'byId\("addDebtBtn"\)\.onclick = \(\) => openModal\(\{.*?\n  \}\}\);\n  byId\("addExpenseBtn"\)',
    r'''byId("addDebtBtn").onclick = () => openModal({ title: "เพิ่มภาระ", text: "รายการตั้งแต่ 2 งวดขึ้นไปจะสร้างคิวทุกงวดในปฏิทิน", body: `<div class="form-grid"><div class="field full"><label>รายละเอียด</label><input id="debtName" maxlength="120" placeholder="เช่น ค่าซ่อมห้อง"></div><div class="field full"><label>หมายเหตุเพิ่มเติม</label><input id="debtDetail" maxlength="180"></div><div class="field"><label>ยอดรวม</label><input id="debtAmount" type="number" min="0.01" step="0.01"></div><div class="field"><label>จำนวนงวด</label><input id="debtInstallments" type="number" min="1" max="120" step="1" value="1"></div><div class="field full"><label>วันครบกำหนดงวดแรก</label><input id="debtDue" type="date" value="${localISO()}"></div></div>`, confirm: "เพิ่มภาระ", onConfirm: async () => {
    const originalSatang = parseMoneyToSatang(byId("debtAmount").value, { allowZero: false, label: "ยอดภาระ" }), installmentCount = Number(byId("debtInstallments").value), firstDue = byId("debtDue").value;
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_INSTALLMENTS || originalSatang < installmentCount || !validISODate(firstDue)) { toast("ตรวจยอด จำนวนงวด 1–120 และวันครบกำหนด"); modalBusy = false; return; }
    const commandId = uid("CMD");
    const idempotencyKey = `obligation-create:${Date.now()}`;
    const payload = { name: byId("debtName").value.trim() || "ภาระ", detail: byId("debtDetail").value.trim(), originalSatang, installmentCount, firstDue };
    closeModal();
    await YGPHDomainCommands.execute({ type: "LEDGER_CREATE_OBLIGATION", commandId, idempotencyKey, payload });
  }});
  byId("addExpenseBtn")''',
    "addDebtBtn"
)

if text == original:
    raise SystemExit("phase2a patch made no changes")

path.write_text(text, encoding="utf-8", newline="\n")
print("phase2a app.js ownership patch applied")
