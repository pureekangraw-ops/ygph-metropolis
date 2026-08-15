import { parseBahtToSatang, makeId } from './ui-model.mjs';
import { projectRideState, projectRideRound } from './product-model.mjs';

const RIDE_VIEWS = new Set(['overview','jobs','summary','history']);

function rideDateTimeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', {
    day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Bangkok',
  }).format(date);
}

export function createRideUi({ getRuntime, getState, run, status, bindForm, bahtText, simpleItem }) {
  if (![getRuntime,getState,run,status,bindForm,bahtText,simpleItem].every(value => typeof value === 'function')) {
    throw new TypeError('INVALID_RIDE_UI_DEPENDENCIES');
  }

  const $ = id => document.getElementById(id);
  let activeRideView = 'overview';
  let selectedRideRoundId = null;

  function setRideView(view='overview') {
    activeRideView = RIDE_VIEWS.has(view) ? view : 'overview';
    document.querySelectorAll('[data-ride-view]').forEach(node => node.classList.toggle('hidden', node.dataset.rideView !== activeRideView));
  }

  function renderRide(context) {
    const state = getState();
    const ride = projectRideState(state, context.today);
    $('rideGenerated').textContent = bahtText(ride.generatedSatang);
    $('ridePendingCredit').textContent = bahtText(ride.pendingCreditSatang);
    $('rideCreditBalance').textContent = bahtText(ride.pendingCreditSatang);
    const stateLabel = ride.todayRoundState === 'ACTIVE' ? 'กำลังวิ่ง' : ride.todayRoundState === 'COMPLETED' ? 'จบรอบแล้ว' : 'ยังไม่เริ่ม';
    $('rideRoundStatus').textContent = stateLabel;
    $('rideStartBtn').textContent = ride.todayRoundState === 'COMPLETED' ? 'เริ่มรอบใหม่' : 'เริ่มรอบ';
    $('rideStartRegion').classList.toggle('hidden', ride.todayRoundState === 'ACTIVE');
    $('rideActiveActions').classList.toggle('hidden', ride.todayRoundState !== 'ACTIVE');
    $('rideEndBtn').disabled = ride.todayRoundState !== 'ACTIVE';
    $('rideCurrentRoundTitle').textContent = ride.todayRoundState === 'ACTIVE' ? 'กำลังวิ่ง' : ride.todayRoundState === 'COMPLETED' ? 'รอบล่าสุดจบแล้ว' : 'ยังไม่มีรอบวันนี้';
    const currentRound = ride.activeRound || ride.latestRound;
    $('rideRoundMeta').textContent = currentRound ? `${rideDateTimeLabel(currentRound.startedAt || currentRound.createdAt)}${currentRound.endedAt ? ` → ${rideDateTimeLabel(currentRound.endedAt)}` : ''}` : '';

    const hasCredit = ride.pendingCreditSatang > 0;
    $('rideCreditActions').classList.toggle('hidden', !hasCredit);
    $('rideCreditQuiet').classList.toggle('hidden', hasCredit);

    const rounds = [...context.rideRecords]
      .filter(record => record.type === 'ROUND')
      .sort((a,b) => String(b.endedAt || b.updatedAt || b.startedAt || b.createdAt || '').localeCompare(String(a.endedAt || a.updatedAt || a.startedAt || a.createdAt || '')));
    if (selectedRideRoundId && !rounds.some(round => round.recordId === selectedRideRoundId)) selectedRideRoundId = null;
    if (!selectedRideRoundId) selectedRideRoundId = ride.activeRound?.recordId || ride.latestRound?.recordId || null;
    const summary = selectedRideRoundId ? projectRideRound(state, selectedRideRoundId) : null;

    const jobList = $('rideRoundJobList');
    jobList.textContent = '';
    const jobs = selectedRideRoundId ? context.rideRecords
      .filter(record => record.type === 'JOB' && record.roundId === selectedRideRoundId && record.status !== 'CANCELLED')
      .sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))) : [];
    for (const record of jobs) {
      const item = simpleItem(record);
      const mode = document.createElement('small');
      mode.className = 'muted';
      mode.textContent = record.paymentMode === 'CASH' ? 'เงินสด' : 'เครดิต';
      item.append(mode);
      jobList.append(item);
    }
    if (!jobs.length) jobList.textContent = selectedRideRoundId ? 'ยังไม่มีงานในรอบนี้' : 'ยังไม่มีรอบให้ดู';
    $('rideJobsMeta').textContent = summary ? `${summary.status === 'ACTIVE' ? 'กำลังวิ่ง' : 'จบรอบ'} · เริ่ม ${rideDateTimeLabel(summary.startedAt)}` : 'ยังไม่มีรอบ';

    $('rideSummaryGenerated').textContent = bahtText(summary?.generatedSatang || 0);
    $('rideSummaryCash').textContent = bahtText(summary?.cashJobSatang || 0);
    $('rideSummaryCredit').textContent = bahtText(summary?.creditJobSatang || 0);
    $('rideSummaryExpense').textContent = bahtText(summary?.expenseSatang || 0);
    $('rideSummaryJobs').textContent = summary ? `${summary.jobCount} งาน · ${summary.status === 'ACTIVE' ? 'กำลังวิ่ง' : 'จบรอบแล้ว'}` : 'ยังไม่มีรอบ';
    $('rideSummaryMeta').textContent = summary ? `${rideDateTimeLabel(summary.startedAt)}${summary.endedAt ? ` → ${rideDateTimeLabel(summary.endedAt)}` : ''}` : '';

    const history = $('rideRoundHistory');
    history.textContent = '';
    for (const round of rounds) {
      const roundSummary = projectRideRound(state, round.recordId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ride-history-button';
      const title = document.createElement('strong');
      title.textContent = round.status === 'ACTIVE' ? 'กำลังวิ่ง' : 'จบรอบ';
      const amount = document.createElement('b');
      amount.textContent = bahtText(roundSummary?.generatedSatang || 0);
      const meta = document.createElement('small');
      meta.textContent = `${rideDateTimeLabel(round.startedAt || round.createdAt)} · ${roundSummary?.jobCount || 0} งาน`;
      button.append(title, amount, meta);
      button.addEventListener('click', () => {
        selectedRideRoundId = round.recordId;
        renderRide(context);
        setRideView('summary');
      });
      history.append(button);
    }
    if (!rounds.length) history.textContent = 'ยังไม่มีประวัติรอบ';
    setRideView(activeRideView);
  }

  function activeRideRound() {
    return getRuntime().project().ride.activeRound;
  }

  function bindRide() {
    document.querySelectorAll('[data-ride-open]').forEach(button => button.addEventListener('click', () => setRideView(button.dataset.rideOpen)));
    $('rideStartBtn').addEventListener('click', () => {
      selectedRideRoundId = null;
      run('rideStartRound', { workflowId:makeId('WF-RIDE-START'), roundId:makeId('ROUND') }, 'เริ่มรอบวิ่งแล้ว');
    });
    $('rideEndBtn').addEventListener('click', () => {
      const round = activeRideRound();
      if (!round) return status('ยังไม่มีรอบที่กำลังวิ่ง', true);
      selectedRideRoundId = round.recordId;
      run('rideEndRound', { workflowId:makeId('WF-RIDE-END'), roundId:round.recordId }, 'จบรอบวิ่งแล้ว');
    });
    bindForm('rideJobForm', data => {
      const round = activeRideRound();
      if (!round) throw new Error('เริ่มรอบก่อนบันทึกงาน');
      const paymentMode = data.get('paymentMode');
      return run('rideJob', {
        workflowId:makeId('WF-RIDE-JOB'), roundId:round.recordId, jobId:makeId('RIDE-JOB'),
        ledgerTransactionId:paymentMode === 'CASH' ? makeId('TX') : undefined,
        amountSatang:parseBahtToSatang(data.get('amount')), paymentMode, note:data.get('note') || '',
      }, 'บันทึกงานวิ่งแล้ว');
    });
    bindForm('rideExpenseForm', data => {
      const round = activeRideRound();
      if (!round) throw new Error('เริ่มรอบก่อนบันทึกค่าใช้จ่าย');
      return run('rideExpense', {
        workflowId:makeId('WF-RIDE-EXP'), roundId:round.recordId, expenseId:makeId('RIDE-EXP'), ledgerTransactionId:makeId('TX'),
        title:data.get('title'), amountSatang:parseBahtToSatang(data.get('amount')),
      }, 'บันทึกค่าใช้จ่ายรอบแล้ว');
    });
    bindForm('rideWithdrawForm', data => run('rideWithdrawCredit', {
      workflowId:makeId('WF-RIDE-WD'), withdrawalId:makeId('RIDE-WD'), ledgerTransactionId:makeId('TX'),
      amountSatang:parseBahtToSatang(data.get('amount')),
    }, 'บันทึกการเบิกเครดิตแล้ว'));
  }

  return Object.freeze({ setRideView, renderRide, bindRide });
}
