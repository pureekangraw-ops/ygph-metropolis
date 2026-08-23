import { projectStoreReceivables } from './product-model.mjs';

export function createStoreUi({ getById, getState, getActiveStoreView, bahtText, simpleItem, setStoreView }) {
  const $ = getById;
  const receivableAmountText = item => item.outstandingSatang == null ? 'ยอดต้องตรวจสอบ' : bahtText(item.outstandingSatang);
  const hasLinkedStoreCostOut = saleId => {
    const sourceRef = `STORE/${saleId}`;
    return Object.values(getState()?.domains?.LEDGER?.records || {}).some(entry => {
      const record = entry?.record;
      return record?.direction === 'OUT'
        && record?.sourceRef === sourceRef
        && (String(record?.subtype || '') === 'STORE_SALE_COST' || String(record?.detail || '').endsWith(':STORE_SALE_COST'));
    });
  };
  const appendSaleEconomics = (article, record, { showRepair = false } = {}) => {
    if (record?.type !== 'SALE') return;
    const storeCost = Number(record.storeCostSatang ?? 0);
    const received = Number(record.receivedSatang ?? 0);
    const netIncome = Number(record.netIncomeSatang ?? (received - storeCost));
    if (![storeCost, received, netIncome].every(Number.isSafeInteger)) return;
    const meta = document.createElement('small');
    meta.className = 'muted';
    meta.textContent = `ต้นทุนร้านค้า ${bahtText(storeCost)} · รายได้สุทธิ ${bahtText(netIncome)}`;
    article.append(meta);
    if (!showRepair || storeCost <= 0 || hasLinkedStoreCostOut(record.recordId)) return;
    const warning = document.createElement('small');
    warning.className = 'truth-warning-text';
    warning.textContent = 'ต้องตรวจสอบ · ต้นทุนรายการเก่านี้ยังไม่มีเงินจริงออกใน Ledger';
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const repair = document.createElement('button');
    repair.type = 'button';
    repair.textContent = 'เติมเงินออกที่ขาด';
    repair.addEventListener('click', () => {
      globalThis.dispatchEvent(new CustomEvent('ygph:repair-store-cost', { detail:{
        saleId:record.recordId,
        title:record.title || 'ขายสินค้า',
        storeCostSatang:storeCost,
      } }));
    });
    actions.append(repair);
    article.append(warning, actions);
  };

  function renderStore(context) {
    const receivables = projectStoreReceivables(getState());
    const hasUnknownReceivable = receivables.items.some(item => item.outstandingSatang == null);
    $('storeToday').textContent = bahtText(context.store.todaySalesSatang);
    $('storeStock').textContent = `${context.store.stockQuantity} ชิ้น`;
    $('storeReceivable').textContent = hasUnknownReceivable ? 'ยอดต้องตรวจสอบ' : bahtText(context.store.receivableSatang);

    const attention = $('storeAttention');
    attention.textContent = '';
    for (const item of receivables.items.filter(item => item.queueState !== 'SCHEDULED')) {
      const warning = document.createElement('article');
      warning.className = 'item truth-warning';
      const title = document.createElement('b');
      title.textContent = item.queueState === 'VERIFY_DUPLICATE' ? 'VERIFY · พบคิวรับเงินซ้ำ' : 'ลูกหนี้ยังไม่มีคิวรับเงินที่ใช้งานได้';
      const meta = document.createElement('small');
      meta.textContent = `${item.title} · ${receivableAmountText(item)}`;
      warning.append(title, meta);
      attention.append(warning);
    }

    const receivableList = $('storeReceivableList');
    receivableList.textContent = '';
    for (const item of receivables.items) {
      const article = document.createElement('article');
      article.className = 'item';
      const head = document.createElement('div');
      head.className = 'item-head';
      const title = document.createElement('b');
      title.textContent = item.title;
      const amount = document.createElement('b');
      amount.textContent = receivableAmountText(item);
      head.append(title, amount);
      const meta = document.createElement('small');
      meta.className = item.queueState === 'SCHEDULED' ? 'muted' : 'truth-warning-text';
      meta.textContent = item.queueState === 'SCHEDULED'
        ? 'มีคิวรับเงินที่ใช้งานได้'
        : item.queueState === 'UNSCHEDULED'
          ? 'ต้องตรวจสอบ · ยังมีลูกหนี้ แต่ไม่มีคิวรับเงินที่ใช้งานได้'
          : 'ต้องตรวจสอบ · พบคิวรับเงินมากกว่า 1 คิว';
      article.append(head, meta);
      receivableList.append(article);
    }
    if (!receivables.items.length) receivableList.textContent = 'ไม่มีลูกหนี้ค้างรับ';

    const movementList = $('storeStockMovementList');
    movementList.textContent = '';
    const movementTypes = new Set(['PURCHASE', 'SALE', 'STOCK_WITHDRAWAL', 'STOCK_ADJUSTMENT']);
    const movements = [...context.storeRecords]
      .filter(record => movementTypes.has(record.type) && record.status !== 'CANCELLED')
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    for (const record of movements) {
      const article = simpleItem(record);
      const quantity = Number(record.quantity || 0);
      const delta = record.type === 'PURCHASE' ? quantity : record.type === 'SALE' || record.type === 'STOCK_WITHDRAWAL' ? -quantity : quantity;
      const stockMeta = document.createElement('small');
      stockMeta.className = 'muted';
      stockMeta.textContent = `ผลต่อสต็อก ${delta > 0 ? '+' : ''}${delta} ชิ้น`;
      article.append(stockMeta);
      appendSaleEconomics(article, record);
      movementList.append(article);
    }
    if (!movements.length) movementList.textContent = 'ยังไม่มีความเคลื่อนไหวสต็อก';

    const list = $('storeList');
    list.textContent = '';
    const records = [...context.storeRecords]
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, 50);
    for (const record of records) {
      const article = simpleItem(record);
      appendSaleEconomics(article, record, { showRepair:true });
      list.append(article);
    }
    if (!records.length) list.textContent = 'ยังไม่มีรายการร้านค้า';
    setStoreView(getActiveStoreView());
  }

  return Object.freeze({ renderStore });
}