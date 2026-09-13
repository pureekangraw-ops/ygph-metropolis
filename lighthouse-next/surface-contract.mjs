import { createLighthouseLedgerBridge } from './runtime-ledger.mjs';

const root = document.querySelector('#demo-root');
const appShell = root?.querySelector('#app-shell');
const manualNav = root?.querySelector('[data-root-target="manual"]');
const manualHub = root?.querySelector('#manual-hub');
const manualDetail = root?.querySelector('#manual-detail');
const manualDetailContent = root?.querySelector('#manual-detail-content');
const ledgerBridge = createLighthouseLedgerBridge();

function operationId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function ensureVisibleRoot() {
  if (!appShell || appShell.hidden) return;
  const visible = [...appShell.querySelectorAll('.app-page')].some((page) => !page.hidden);
  if (!visible) manualNav?.click();
}

function makeRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  const left = document.createElement('span');
  left.textContent = label;
  const right = document.createElement('strong');
  right.textContent = value;
  row.append(left, right);
  return row;
}

function makeHero(title, intro) {
  const hero = document.createElement('div');
  hero.className = 'detail-hero';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = intro;
  hero.append(heading, copy);
  return hero;
}

function formatSatang(value) {
  return `฿${(Number(value || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function openSurfaceDetail() {
  manualHub.hidden = true;
  manualDetail.hidden = false;
  manualDetailContent.replaceChildren();
}

async function renderIncome() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('Income', 'รายรับทั้งหมดอยู่บ้านนี้ และเพิ่มรายรับตรงได้โดยไม่ผ่าน Chat'));

  const form = document.createElement('form');
  form.className = 'auth-form manual-direct-form';
  form.id = 'manual-income-form';
  form.innerHTML = `
    <label>จำนวนเงิน (บาท)</label>
    <input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required>
    <label>ที่มา</label>
    <input name="source" type="text" maxlength="80" required>
    <button class="primary-button" type="submit">บันทึกรายรับ</button>
    <p class="pin-status" data-manual-status aria-live="polite"></p>
  `;
  manualDetailContent.append(form);

  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);

  async function refresh() {
    list.replaceChildren();
    try {
      const truth = await ledgerBridge.readLedgerTruth();
      list.append(
        makeRow('เงินจริง', formatSatang(truth.balanceSatang)),
        makeRow('เงินเข้าวันนี้', formatSatang(truth.todayInSatang)),
      );
      const incomes = truth.transactions.filter((item) => item.direction === 'IN').slice(0, 20);
      if (!incomes.length) list.append(makeRow('รายการล่าสุด', 'ยังไม่มีรายรับ'));
      for (const item of incomes) list.append(makeRow(item.title || 'รายรับ', formatSatang(item.amountSatang)));
    } catch {
      list.append(makeRow('สถานะ', 'ยังอ่านข้อมูลจริงไม่ได้'));
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-manual-status]');
    const data = new FormData(form);
    const amountBaht = Number(data.get('amount'));
    const source = String(data.get('source') || '').trim();
    if (!Number.isFinite(amountBaht) || amountBaht <= 0 || !source) {
      status.textContent = 'กรอกจำนวนเงินและที่มาให้ครบ';
      return;
    }
    status.textContent = 'กำลังบันทึก…';
    try {
      await ledgerBridge.recordOtherIncome({
        workflowId: operationId('WF-LH-MANUAL-INCOME'),
        ledgerTransactionId: operationId('TX-LH-MANUAL-INCOME'),
        source,
        amountBaht,
      });
      form.reset();
      status.textContent = 'บันทึกแล้ว · อ่านกลับจาก Ledger สำเร็จ';
      await refresh();
      root.querySelector('[data-root-target="manual"]')?.click();
    } catch (error) {
      status.textContent = String(error?.message || '').includes('RUNTIME_SESSION_LOCKED')
        ? 'แอปถูกล็อก กรุณาเข้าใหม่'
        : 'ยังบันทึกไม่สำเร็จ · ไม่มีข้อมูลถูกเปลี่ยน';
    }
  });

  await refresh();
}

async function renderOutcome() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('Outcome', 'รายจ่ายและภาระอยู่บ้านนี้ การอ่านใช้ Ledger จริง; การเขียนจะไม่ปลอมจนกว่าจะมี Outcome write contract'));
  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);
  try {
    const truth = await ledgerBridge.readLedgerTruth();
    list.append(makeRow('เงินออกวันนี้', formatSatang(truth.todayOutSatang)));
    const outcomes = truth.transactions.filter((item) => item.direction === 'OUT').slice(0, 20);
    if (!outcomes.length) list.append(makeRow('รายการล่าสุด', 'ยังไม่มีรายจ่าย'));
    for (const item of outcomes) list.append(makeRow(item.title || 'รายจ่าย', `-${formatSatang(item.amountSatang)}`));
    list.append(makeRow('เพิ่ม/แก้/จ่ายภาระ', 'รอ Outcome write contract'));
  } catch {
    list.append(makeRow('สถานะ', 'ยังอ่านข้อมูลจริงไม่ได้'));
  }
}

root?.addEventListener('click', (event) => {
  const task = event.target.closest?.('[data-task]')?.dataset.task;
  if (task !== 'income' && task !== 'outcome') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (task === 'income') void renderIncome();
  else void renderOutcome();
}, true);

const observer = new MutationObserver(() => queueMicrotask(ensureVisibleRoot));
if (appShell) observer.observe(appShell, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
ensureVisibleRoot();
