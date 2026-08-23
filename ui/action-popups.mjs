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

const MENUS = Object.freeze({
  'daily-goal': { targetId:'goalForm', label:'เป้ารายได้วันนี้' },
  'finance-obligations': { targetId:'obligationList', label:'ภาระคงเหลือ' },
  'finance-ledger': { targetId:'ledgerList', label:'ประวัติเงินจริง' },
});

const CITY_ACTIONS = Object.freeze({
  'store-actions': {
    label:'จัดการร้านค้า',
    actions:[
      { kind:'task', key:'sale', label:'ขายสินค้า', primary:true },
      { kind:'task', key:'purchase', label:'รับสินค้าเข้า' },
      { kind:'task', key:'withdraw', label:'เบิกสินค้า' },
      { kind:'task', key:'adjust', label:'ปรับสต็อก' },
    ],
  },
  'finance-actions': {
    label:'จัดการการเงิน',
    actions:[
      { kind:'task', key:'income', label:'บันทึกรายรับอื่น' },
      { kind:'task', key:'expense', label:'เพิ่มรายจ่าย' },
      { kind:'task', key:'obligation', label:'เพิ่มภาระ' },
      { kind:'menu', key:'finance-obligations', label:'ภาระคงเหลือ' },
      { kind:'menu', key:'finance-ledger', label:'ประวัติเงินจริง' },
    ],
  },
});

const forms = new Map();
const originalGroups = new Map();
let pendingForm = null;
let pendingMenuForm = null;

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

function clearTaskContext() {
  forms.get('expense')?.removeAttribute('data-calendar-queue-id');
}

function closeTaskDialog() {
  if (dialog.open) dialog.close();
  for (const pane of panes.querySelectorAll('[data-task-pane]')) pane.classList.add('hidden');
  taskStatus.textContent = '';
  taskStatus.classList.remove('error');
  clearTaskContext();
  pendingForm = null;
}

function openTaskDialog(task) {
  const config = TASKS[task];
  const pane = panes.querySelector(`[data-task-pane="${task}"]`);
  if (!config || !pane) return;
  if (task === 'expense') clearTaskContext();
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

globalThis.addEventListener?.('ygph:open-task', event => {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
  const task = String(detail.task || '');
  const form = forms.get(task);
  if (!form) return;
  openTaskDialog(task);
  if (detail.values && typeof detail.values === 'object') {
    for (const [name, value] of Object.entries(detail.values)) {
      const field = form.elements.namedItem(name);
      if (field && 'value' in field) field.value = String(value ?? '');
    }
  }
  if (task === 'expense' && detail.context?.calendarQueueId) {
    form.dataset.calendarQueueId = String(detail.context.calendarQueueId);
  }
  form.querySelector('input,select,textarea,button')?.focus();
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

const menuDialog = document.createElement('dialog');
menuDialog.id = 'menuDialog';
menuDialog.className = 'modal-dialog menu-dialog';
menuDialog.setAttribute('aria-labelledby', 'menuDialogTitle');
const menuBody = document.createElement('div');
menuBody.className = 'dialog-body';
const menuHead = document.createElement('div');
menuHead.className = 'dialog-head';
const menuTitle = document.createElement('h2');
menuTitle.id = 'menuDialogTitle';
const menuCloseButton = document.createElement('button');
menuCloseButton.type = 'button';
menuCloseButton.className = 'secondary';
menuCloseButton.textContent = 'ปิด';
menuCloseButton.setAttribute('aria-label', 'ปิด');
menuHead.append(menuTitle, menuCloseButton);
const menuStatus = document.createElement('p');
menuStatus.className = 'status';
menuStatus.setAttribute('aria-live', 'polite');
const menuPanes = document.createElement('div');
menuPanes.className = 'menu-panes';
menuBody.append(menuHead, menuStatus, menuPanes);
menuDialog.append(menuBody);

function makeMenuLauncher(menu, config) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.menuOpen = menu;
  button.className = 'menu-launcher';
  button.textContent = config.label;
  button.setAttribute('aria-controls', 'menuDialog');
  return button;
}

for (const [menu, config] of Object.entries(MENUS)) {
  const target = document.getElementById(config.targetId);
  const details = target?.closest('details');
  if (!target || !details) continue;
  const summary = details.querySelector(':scope > summary');
  const pane = document.createElement('section');
  pane.dataset.menuPane = menu;
  pane.className = 'hidden';
  for (const child of [...details.children]) {
    if (child !== summary) pane.append(child);
  }
  menuPanes.append(pane);
  details.replaceWith(makeMenuLauncher(menu, config));
}

if (workspace) workspace.append(menuDialog);

function closeMenuDialog() {
  if (menuDialog.open) menuDialog.close();
  for (const pane of menuPanes.querySelectorAll('[data-menu-pane]')) pane.classList.add('hidden');
  menuStatus.textContent = '';
  menuStatus.classList.remove('error');
  pendingMenuForm = null;
}

function openMenuDialog(menu) {
  const config = MENUS[menu];
  const pane = menuPanes.querySelector(`[data-menu-pane="${menu}"]`);
  if (!config || !pane) return;
  for (const candidate of menuPanes.querySelectorAll('[data-menu-pane]')) candidate.classList.toggle('hidden', candidate !== pane);
  menuTitle.textContent = config.label;
  menuStatus.textContent = '';
  menuStatus.classList.remove('error');
  pendingMenuForm = null;
  if (!menuDialog.open) menuDialog.showModal();
  pane.querySelector('input,select,textarea,button')?.focus();
}

document.querySelectorAll('[data-menu-open]').forEach(button => {
  button.addEventListener('click', () => openMenuDialog(button.dataset.menuOpen));
});
menuCloseButton.addEventListener('click', closeMenuDialog);
menuDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeMenuDialog();
});

for (const pane of menuPanes.querySelectorAll('[data-menu-pane]')) {
  const form = pane.querySelector('form');
  if (!form) continue;
  form.addEventListener('submit', () => {
    pendingMenuForm = form;
    menuStatus.textContent = 'กำลังบันทึก…';
    menuStatus.classList.remove('error');
  }, { capture:true });
}

const cityActionDialog = document.createElement('dialog');
cityActionDialog.id = 'cityActionDialog';
cityActionDialog.className = 'modal-dialog city-action-dialog';
cityActionDialog.setAttribute('aria-labelledby', 'cityActionDialogTitle');
const cityActionBody = document.createElement('div');
cityActionBody.className = 'dialog-body';
const cityActionHead = document.createElement('div');
cityActionHead.className = 'dialog-head';
const cityActionTitle = document.createElement('h2');
cityActionTitle.id = 'cityActionDialogTitle';
const cityActionCloseButton = document.createElement('button');
cityActionCloseButton.type = 'button';
cityActionCloseButton.className = 'secondary';
cityActionCloseButton.textContent = 'ปิด';
cityActionCloseButton.setAttribute('aria-label', 'ปิด');
cityActionHead.append(cityActionTitle, cityActionCloseButton);
const cityActionChoices = document.createElement('div');
cityActionChoices.className = 'city-action-choices';
cityActionBody.append(cityActionHead, cityActionChoices);
cityActionDialog.append(cityActionBody);
if (workspace) workspace.append(cityActionDialog);

function closeCityActionDialog() {
  if (cityActionDialog.open) cityActionDialog.close();
  cityActionChoices.replaceChildren();
}

function runCityAction(action) {
  closeCityActionDialog();
  if (action.kind === 'task') openTaskDialog(action.key);
  if (action.kind === 'menu') openMenuDialog(action.key);
}

function openCityActionDialog(city) {
  const config = CITY_ACTIONS[city];
  if (!config) return;
  cityActionTitle.textContent = config.label;
  cityActionChoices.replaceChildren();
  for (const action of config.actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cityActionChoice = action.key;
    button.textContent = action.label;
    if (action.primary) button.classList.add('primary-action');
    button.addEventListener('click', () => runCityAction(action));
    cityActionChoices.append(button);
  }
  if (!cityActionDialog.open) cityActionDialog.showModal();
  cityActionChoices.querySelector('button')?.focus();
}

function makeCityActionLauncher(city, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.cityActionOpen = city;
  button.className = 'primary-action city-action-launcher';
  button.textContent = label;
  button.setAttribute('aria-controls', 'cityActionDialog');
  return button;
}

function collapseCityLaunchers(pageSelector, city, taskKeys, menuKeys = []) {
  const page = document.querySelector(pageSelector);
  if (!page) return;
  const taskSet = new Set(taskKeys);
  const menuSet = new Set(menuKeys);
  const targets = [...page.querySelectorAll('[data-task-open],[data-menu-open]')].filter(button =>
    taskSet.has(button.dataset.taskOpen) || menuSet.has(button.dataset.menuOpen)
  );
  if (!targets.length) return;
  const first = targets[0];
  const anchor = first.closest('.action-row') || first;
  anchor.before(makeCityActionLauncher(city, CITY_ACTIONS[city].label));
  const parents = new Set();
  for (const target of targets) {
    if (target.parentElement) parents.add(target.parentElement);
    target.remove();
  }
  for (const parent of parents) {
    if (parent.children.length === 0 && (parent.classList.contains('action-row') || parent.classList.contains('task-launchers'))) parent.remove();
  }
}

collapseCityLaunchers('[data-area-page="store"]', 'store-actions', ['sale','purchase','withdraw','adjust']);
collapseCityLaunchers('[data-area-page="finance"]', 'finance-actions', ['income','expense','obligation'], ['finance-obligations','finance-ledger']);

document.querySelectorAll('[data-city-action-open]').forEach(button => {
  button.addEventListener('click', () => openCityActionDialog(button.dataset.cityActionOpen));
});
cityActionCloseButton.addEventListener('click', closeCityActionDialog);
cityActionDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeCityActionDialog();
});

const appStatus = document.getElementById('appStatus');
if (appStatus) {
  new MutationObserver(() => {
    if (dialog.open && pendingForm) {
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
      return;
    }
    if (menuDialog.open && pendingMenuForm) {
      const message = (appStatus.textContent || '').trim();
      if (!message) return;
      if (appStatus.classList.contains('error')) {
        menuStatus.textContent = message;
        menuStatus.classList.add('error');
        pendingMenuForm = null;
        return;
      }
      closeMenuDialog();
    }
  }).observe(appStatus, { childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['class'] });
}
