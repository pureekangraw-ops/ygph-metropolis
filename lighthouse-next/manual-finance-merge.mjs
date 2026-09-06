const financeCard = document.querySelector('[data-task="finance"]');
const detailRoot = document.querySelector('#manual-detail-content');

function textFrom(selector, fallback = '—') {
  const value = document.querySelector(selector)?.textContent?.trim();
  return value || fallback;
}

function makeDetailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.dataset.financeObligationRow = 'true';

  const left = document.createElement('span');
  left.textContent = label;
  const right = document.createElement('strong');
  right.textContent = value;
  row.append(left, right);
  return row;
}

function mergeFinanceDetail() {
  if (!detailRoot) return;
  const heading = detailRoot.querySelector('.detail-hero h2');
  const list = detailRoot.querySelector('.detail-list');
  if (!heading || heading.textContent.trim() !== 'การเงิน' || !list) return;
  if (list.querySelector('[data-finance-obligation-row]')) return;

  const due = textFrom('.obligation-main span').replace(/^ครบกำหนดใน/u, '').trim() || '—';
  list.append(
    makeDetailRow('ภาระใกล้สุด', textFrom('.obligation-amount')),
    makeDetailRow('ครบกำหนด', due),
    makeDetailRow('ยังขาด', textFrom('.gap-row strong')),
    makeDetailRow('เป้าวันนี้', textFrom('.target-row strong')),
  );
}

financeCard?.addEventListener('click', () => queueMicrotask(mergeFinanceDetail));
queueMicrotask(mergeFinanceDetail);
