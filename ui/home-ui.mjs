import { formatSatang } from './ui-model.mjs';
import { projectAttention } from './product-model.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createHomeUi({ getById, bahtText, numberText, routeTo }) {
  const $ = getById;

  function routeFromSummary(button) {
    const area = String(button.dataset.routeArea || '').toUpperCase();
    if (!area) return;
    const target = { area };
    if (button.dataset.routeDate) target.date = button.dataset.routeDate;
    if (button.dataset.routeFocus) target.focus = button.dataset.routeFocus;
    routeTo(target);
  }

  document.querySelectorAll('[data-home-summary]').forEach(button => {
    button.addEventListener('click', () => routeFromSummary(button));
  });

  function setSummaryRoute(key, { area, date = '', focus = '', owner = area.toLowerCase(), label = '' }) {
    const button = document.querySelector(`[data-home-summary="${key}"]`);
    if (!button) return;
    button.dataset.routeArea = area;
    if (date) button.dataset.routeDate = date; else delete button.dataset.routeDate;
    if (focus) button.dataset.routeFocus = focus; else delete button.dataset.routeFocus;
    button.dataset.owner = owner;
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function svgElement(name, attributes = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }

  function renderCashFlow(context) {
    const root = $('homeCashFlowChart');
    if (!root) return;
    const series = Array.isArray(context.cashFlow) ? context.cashFlow : [];
    const totalIn = series.reduce((sum, item) => sum + Number(item.inSatang || 0), 0);
    const totalOut = series.reduce((sum, item) => sum + Number(item.outSatang || 0), 0);
    $('homeCashFlowIn').textContent = bahtText(totalIn);
    $('homeCashFlowOut').textContent = bahtText(totalOut);
    root.textContent = '';

    const maxValue = Math.max(0, ...series.flatMap(item => [Number(item.inSatang || 0), Number(item.outSatang || 0)]));
    if (!series.length || maxValue === 0) {
      const quiet = document.createElement('p');
      quiet.className = 'cash-flow-zero muted';
      quiet.textContent = 'ยังไม่มีเงินเข้า–ออกจริงในช่วง 7 วันนี้';
      root.append(quiet);
      return;
    }

    const width = 700;
    const height = 190;
    const baseline = 145;
    const chartHeight = 110;
    const groupWidth = width / series.length;
    const barWidth = Math.min(26, groupWidth * 0.26);
    const svg = svgElement('svg', {
      class: 'cash-flow-svg', viewBox: `0 0 ${width} ${height}`, role: 'img',
      'aria-label': `เงินเข้า 7 วัน ${bahtText(totalIn)} เงินออก ${bahtText(totalOut)}`,
      preserveAspectRatio: 'xMidYMid meet',
    });
    svg.append(svgElement('line', { class:'cash-flow-baseline', x1:0, y1:baseline, x2:width, y2:baseline }));

    series.forEach((item, index) => {
      const groupCenter = index * groupWidth + groupWidth / 2;
      const inHeight = Math.max(2, Math.round((Number(item.inSatang || 0) / maxValue) * chartHeight));
      const outHeight = Math.max(2, Math.round((Number(item.outSatang || 0) / maxValue) * chartHeight));
      const group = svgElement('g', {
        class:'cash-flow-day',
        'aria-label': `${item.date} เงินเข้า ${bahtText(item.inSatang)} เงินออก ${bahtText(item.outSatang)}`,
      });
      group.append(svgElement('rect', {
        class:'cash-flow-bar cash-flow-in', x:groupCenter - barWidth - 3, y:baseline - inHeight,
        width:barWidth, height:inHeight, rx:4,
      }));
      group.append(svgElement('rect', {
        class:'cash-flow-bar cash-flow-out', x:groupCenter + 3, y:baseline - outHeight,
        width:barWidth, height:outHeight, rx:4,
      }));
      const label = svgElement('text', { class:'cash-flow-day-label', x:groupCenter, y:172, 'text-anchor':'middle' });
      const date = new Date(`${item.date}T12:00:00+07:00`);
      label.textContent = new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short'}).format(date);
      group.append(label);
      svg.append(group);
    });
    root.append(svg);
  }

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

    setSummaryRoute('balance', { area:'FINANCE', owner:'finance', label:`เงินสดคงเหลือ ${bahtText(context.finance.cashBalanceSatang)} — เปิดการเงิน` });
    const generatedArea = Number(context.money.rideSatang || 0) > Number(context.money.storeSatang || 0) ? 'RIDE' : 'STORE';
    setSummaryRoute('generated', { area:generatedArea, owner:generatedArea.toLowerCase(), label:`สร้างได้วันนี้ ${bahtText(context.money.combinedSatang)} — เปิด${generatedArea === 'RIDE' ? 'วิ่งงาน' : 'ร้านค้า'}` });
    setSummaryRoute('stock', { area:'STORE', owner:'store', label:`สต็อก ${context.store.stockQuantity} ชิ้น — เปิดร้านค้า` });
    setSummaryRoute('due', { area:'CALENDAR', owner:'finance', date:context.finance.nextDue?.dueDate || context.today, focus:'schedule', label:`ใกล้ครบกำหนด ${bahtText(context.finance.nearTermDueSatang)} — เปิดกำหนดชำระในการเงิน` });

    renderCashFlow(context);

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
