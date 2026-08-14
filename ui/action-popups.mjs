const TASKS = Object.freeze({
  'sale': { formId:'saleForm', label:'ขายสินค้า', primary:true },
  'purchase': { formId:'purchaseForm', label:'รับสินค้าเข้า' },
  'withdraw': { formId:'withdrawForm', label:'เบิกสินค้า' },
  'adjust': { formId:'adjustForm', label:'ปรับสต็อก' },
  'ride-job': { formId:'rideJobForm', label:'บันทึกงาน', primary:true },
  'ride-expense': { formId:'rideExpenseForm', label:'ค่าใช้จ่ายรอบ' },
  'ride-withdraw': { formId:'rideWithdrawForm', label:'เบิกเครดิต' },
  'income': { formId:'incomeForm', label:'บันทึกรายรับอื่น' },
  'expense': { formId:'expenseForm', label:'เพิ่มรายจ่าย' },
  'obligation': { formId:'obligationForm', label:'เพิ่มภาระ' },
});

const forms = new Map();
const originalGroups = new Map();
let pendingForm = null;

for (const [task, config] of Object.entries(TASKS)) {
  const form = document.getElementById(config.formId);
  if (!form) continue;
  const details = form.closest('details');
  if (!details) continue;
  forms.set(task, form);
  if (!originalGroups.has(details)) originalGroups.set(details, []);
  originalGroups.get(details).push({ task, config, form });
}

const dialog = document.createElement('dialog');
dialog.id = 'taskDialog';
dialog.className = 'modal-dialog action-dialog';
dialog.setAttribute('aria-labelledby', 'taskDialogTitle');

const body = document.createElement('div');
body.className = 'dialog-body';
const head = document.createElement('div');
head.className = 'dialog-head';
const title = document.createElement('h2');
title.id = 'taskDialogTitle';
const closeButton = document.createElement('button');
closeButton.id = 'taskDialogCloseBtn';
closeButton.type = 'button';
closeButton.className = 'secondary';
closeButton.textContent = 'ปิด';
closeButton.setAttribute('aria-label', 'ปิด');
head.append(title, closeButton);

const taskStatus = document.createElement('p');
taskStatus.id = 'taskDialogStatus';
taskStatus.className = 'status';
taskStatus.setAttribute('aria-live', 'polite');
const panes = document.createElement('div');
panes.className = 'task-panes';
body.append(head, taskStatus, panes);
dialog.append(body);

function makeLauncher(task, config) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.taskOpen = task;
  button.textContent = config.label;
  button.setAttribute('aria-controls', 'taskDialog');
  if (config.primary) button.classList.add('primary-action');
  return button;
}

for (const [details, entries] of originalGroups) {
  const parent = details.parentElement;
  const launchers = entries.map(({ task, config }) => makeLauncher(task, config));
  if (launchers.length === 1 && parent?.classList.contains('action-row')) {
    details.replaceWith(launchers[0]);
  } else {
    const row = document.createElement('div');
    row.className = 'action-row task-launchers';
    row.append(...launchers);
    details.replaceWith(row);
  }
}

for (const [task, form] of forms) {
  const pane = document.createElement('section');
  pane.dataset.taskPane = task;
  pane.className = 'hidden';
  form.classList.remove('card');
  pane.append(form);
  panes.append(pane);
}

const workspace = document.getElementById('workspace');
if (workspace) workspace.append(dialog);

function closeTaskDialog() {
  if (dialog.open) dialog.close();
  for (const pane of panes.querySelectorAll('[data-task-pane]')) pane.classList.add('hidden');
  taskStatus.textContent = '';
  taskStatus.classList.remove('error');
  pendingForm = null;
}

function openTaskDialog(task) {
  const config = TASKS[task];
  const pane = panes.querySelector(`[data-task-pane="${task}"]`);
  if (!config || !pane) return;
  for (const candidate of panes.querySelectorAll('[data-task-pane]')) candidate.classList.toggle('hidden', candidate !== pane);
  title.textContent = config.label;
  taskStatus.textContent = '';
  taskStatus.classList.remove('error');
  pendingForm = null;
  if (!dialog.open) dialog.showModal();
  pane.querySelector('input,select,textarea,button')?.focus();
}

document.querySelectorAll('[data-task-open]').forEach(button => {
  button.addEventListener('click', () => openTaskDialog(button.dataset.taskOpen));
});

closeButton.addEventListener('click', closeTaskDialog);
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeTaskDialog();
});

for (const form of forms.values()) {
  form.addEventListener('submit', () => {
    pendingForm = form;
    taskStatus.textContent = 'กำลังบันทึก…';
    taskStatus.classList.remove('error');
  }, { capture:true });
}

const appStatus = document.getElementById('appStatus');
if (appStatus) {
  new MutationObserver(() => {
    if (!dialog.open || !pendingForm) return;
    const message = (appStatus.textContent || '').trim();
    if (!message) return;
    if (appStatus.classList.contains('error')) {
      taskStatus.textContent = message;
      taskStatus.classList.add('error');
      pendingForm = null;
      return;
    }
    const completedForm = pendingForm;
    completedForm.reset();
    closeTaskDialog();
  }).observe(appStatus, { childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['class'] });
}
