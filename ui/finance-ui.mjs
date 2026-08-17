export function createFinanceUi({ getById, numberText, bahtText, simpleItem, routeTo }) {
  const $ = getById;

  function renderFinance(context) {
    const view = context.finance;
    $('financeBalance').textContent = numberText(view.cashBalanceSatang);
    $('financeIn').textContent = bahtText(view.todayInSatang);
    $('financeOut').textContent = bahtText(view.todayOutSatang);
    $('financeMonthDue').textContent = bahtText(view.monthDueSatang);

    const openNext = $('financeOpenNextDue');
    if (!view.nextDue) {
      $('financePressureText').textContent = 'ไม่มีคิวภาระที่รอจ่าย';
      $('financePressureMeta').textContent = '';
      openNext.classList.add('hidden');
    } else {
      if (view.shortfallSatang > 0) $('financePressureText').textContent = `เงินสดยังต่ำกว่ายอดคิวใกล้ถึง ${bahtText(view.shortfallSatang)}`;
      else if (view.nextDue.canPayNow) $('financePressureText').textContent = 'เงินสดถึงยอดคิวถัดไปแล้ว — พิจารณาจ่ายได้';
      else $('financePressureText').textContent = 'คิวภาระใกล้ถึงอยู่ในระยะเฝ้าดู';
      const days = view.nextDue.daysRemaining;
      $('financePressureMeta').textContent = `${days < 0 ? `เลยกำหนด ${Math.abs(days)} วัน` : days === 0 ? 'ครบกำหนดวันนี้' : `อีก ${days} วัน`} · ${bahtText(view.nextDue.amountSatang)}`;
      openNext.classList.remove('hidden');
      openNext.onclick = () => routeTo({ area: 'CALENDAR', date: view.nextDue.dueDate, recordId: view.nextDue.recordId });
    }

    const obligationList = $('obligationList');
    obligationList.textContent = '';
    const obligations = context.ledgerRecords
      .filter(record => record.type === 'OBLIGATION')
      .sort((a, b) => Number(b.remainingSatang ?? b.amountSatang ?? 0) - Number(a.remainingSatang ?? a.amountSatang ?? 0));
    for (const record of obligations) {
      const display = { ...record, amountSatang: Number(record.remainingSatang ?? record.amountSatang ?? 0), title: record.title || 'ภาระ' };
      obligationList.append(simpleItem(display));
    }
    if (!obligations.length) obligationList.textContent = 'ยังไม่มีภาระ';

    const ledgerList = $('ledgerList');
    ledgerList.textContent = '';
    const transactions = context.ledgerRecords
      .filter(record => record.type === 'TRANSACTION')
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, 50);
    for (const record of transactions) ledgerList.append(simpleItem(record));
    if (!transactions.length) ledgerList.textContent = 'ยังไม่มีประวัติเงินจริง';
  }

  return Object.freeze({ renderFinance });
}
