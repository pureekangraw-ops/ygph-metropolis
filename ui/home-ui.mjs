import { formatSatang } from './ui-model.mjs';
import { projectAttention } from './product-model.mjs';

export function createHomeUi({ getById, bahtText, numberText, routeTo }) {
  const $ = getById;

  function renderHome(context) {
    const node = $('attentionList');
    node.textContent = '';
    const attention = projectAttention({
      calendarRecords: context.calendarRecords,
      finance: context.finance,
      goal: { goalSatang: context.goal.goalSatang, generatedSatang: context.money.combinedSatang },
      today: context.today,
    });
    $('homeQuiet').classList.toggle('hidden', attention.length !== 0);
    for (const entry of attention) {
      const button = document.createElement('button');
      button.className = 'attention-item';
      button.dataset.kind = entry.kind;
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const amount = document.createElement('b');
      amount.textContent = Number(entry.amountSatang || 0) > 0 ? bahtText(entry.amountSatang) : entry.count ? `${entry.count} รายการ` : '';
      const meta = document.createElement('small');
      meta.textContent = entry.kind === 'OVERDUE' ? 'เลยกำหนดแล้ว' : entry.kind === 'TODAY' ? 'ต้องจัดการวันนี้' : 'แตะเพื่อไปยังเจ้าของงาน';
      button.append(title, amount, meta);
      button.addEventListener('click', () => routeTo(entry.target));
      node.append(button);
    }
    $('homeBalance').textContent = bahtText(context.finance.cashBalanceSatang);
    $('homeGenerated').textContent = bahtText(context.money.combinedSatang);
    $('homeStock').textContent = `${context.store.stockQuantity} ชิ้น`;
    $('homeDue').textContent = bahtText(context.finance.nearTermDueSatang);
    $('moneyGoal').textContent = numberText(context.goal.goalSatang);
    const remaining = Math.max(0, context.goal.goalSatang - context.money.combinedSatang);
    $('moneyRemaining').textContent = numberText(remaining);
    const progress = context.goal.goalSatang > 0
      ? Math.round((context.money.combinedSatang / context.goal.goalSatang) * 100)
      : (context.money.combinedSatang > 0 ? 100 : 0);
    $('moneyProgress').textContent = `${progress}%`;
    $('goalForm').elements.goal.value = formatSatang(context.goal.goalSatang);
  }

  return Object.freeze({ renderHome });
}
