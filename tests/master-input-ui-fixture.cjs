"use strict";
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

let importCounter = 0;

class FakeClassList {
  constructor() { this.values = new Set(); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    if (force === true) { this.values.add(value); return true; }
    if (force === false) { this.values.delete(value); return false; }
    if (this.values.has(value)) { this.values.delete(value); return false; }
    this.values.add(value); return true;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.className = '';
    this.parentNode = null;
    this._id = '';
    this._innerHTML = '';
  }
  get id() { return this._id; }
  set id(value) {
    this._id = String(value || '');
    if (this._id) this.ownerDocument.elements.set(this._id, this);
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value || '');
    const pattern = /<([a-zA-Z0-9-]+)[^>]*\bid="([^"]+)"[^>]*>/g;
    let match;
    while ((match = pattern.exec(this._innerHTML))) {
      if (this.ownerDocument.elements.has(match[2])) continue;
      const child = new FakeElement(match[1], this.ownerDocument);
      child.id = match[2];
      child.parentNode = this;
      this.children.push(child);
    }
  }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) || []) handler.call(this, event);
    return true;
  }
  requestSubmit() {
    this.dispatchEvent({ type:'submit', preventDefault(){} });
  }
  async click() {
    const event = { type:'click', preventDefault(){} };
    for (const handler of this.listeners.get('click') || []) await handler.call(this, event);
  }
  append(child) {
    child.parentNode = this;
    this.children.push(child);
  }
  prepend(child) {
    child.parentNode = this;
    this.children.unshift(child);
  }
  replaceChildren(...children) {
    this.children = [];
    for (const child of children) this.append(child);
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.head = new FakeElement('head', this);
    const workspace = new FakeElement('main', this);
    workspace.id = 'workspace';
  }
  getElementById(id) { return this.elements.get(id) || null; }
  createElement(tagName) { return new FakeElement(tagName, this); }
  querySelector(selector) {
    if (selector === 'link[data-master-input-style]') {
      return this.head.children.find(child => child.tagName === 'LINK' && child.dataset.masterInputStyle) || null;
    }
    return null;
  }
}

function minimalEvidence(packageId, importedRecords = []) {
  const balance = importedRecords.reduce((sum, record) => record.type !== 'TRANSACTION' || record.status === 'CANCELLED'
    ? sum : sum + (record.direction === 'IN' ? 1 : -1) * record.amountSatang, 0);
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE',
    formatVersion:3,
    evidenceSchemaVersion:'3.1',
    packageId,
    packageMode:'SNAPSHOT_AND_DELTA',
    snapshotAsOf:'2026-08-28T01:00:00.000Z',
    sourceRevision:1,
    reconciliation:{ status:'PASS', blockingIssues:[] },
    events:[{
      eventId:`${packageId}-0`, source:'LEDGER', owner:'LEDGER',
      payload:{ record:{ recordId:'LEDGER-CURRENT', type:'CURRENT_BALANCE', amountSatang:balance, calculation:{ openingBalanceSatang:0 } } },
      validation:{ ownerConfirmation:'UNCONFIRMED' },
    }, ...importedRecords.map((record, index) => ({
      eventId:`${packageId}-import-${index}`, source:'LEDGER', owner:'LEDGER',
      payload:{ record }, validation:{ ownerConfirmation:'UNCONFIRMED' },
    }))],
  });
}

async function initializedRuntime(packageId, { now = ()=>'2026-08-28T02:00:00.000Z', importedRecords = [] } = {}) {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const runtime = createGreenfieldRuntime({
    store:createMemoryVaultStore(),
    passphrase:'correct horse battery staple',
    lockManager:null,
    now,
  });
  const initial = await runtime.initializeFromEvidence(minimalEvidence(packageId, importedRecords), {
    expectedPackageId:packageId,
    expectedRevision:1,
  });
  assert.equal(initial.status, 'IMPORTED_VERIFIED');
  return runtime;
}

function transactionRecords(state) {
  return Object.values(state.domains.LEDGER.records)
    .map(entry => entry.record)
    .filter(record => record.type === 'TRANSACTION');
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`WAIT_TIMEOUT:${label}`);
}

async function setupProductionUi(caseId, options = {}) {
  const runtime = await initializedRuntime(`FLOW-P1-FINAL-${caseId}`, options);
  const { activateRuntimeSession, deactivateRuntimeSession } = await import('../greenfield/runtime-session.mjs');
  activateRuntimeSession(runtime);

  const document = new FakeDocument();
  globalThis.document = document;
  let providerCalls = 0;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    providerCalls += 1;
    requests.push({ url, init });
    if (options.fetchResponse) return options.fetchResponse({ url, init });
    throw new Error('PROVIDER_SHOULD_NOT_RUN');
  };
  globalThis.dispatchEvent = () => true;
  if (typeof globalThis.CustomEvent !== 'function') {
    globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
  }

  const uiUrl = new URL('../ui/master-input.mjs', pathToFileURL(__filename));
  uiUrl.searchParams.set('finalGate', `${caseId}-${++importCounter}`);
  const ui = await import(uiUrl.href);

  async function submit(text) {
    document.getElementById('masterInputText').value = text;
    document.getElementById('masterInputForm').requestSubmit();
    await waitFor(() => {
      const state = document.getElementById('masterInputState').textContent;
      return state && state !== 'INTERPRETING' && state !== 'IDLE';
    }, `submit:${text}`);
    return document.getElementById('masterInputState').textContent;
  }

  async function execute() {
    const actions = document.getElementById('masterInputActions');
    assert.equal(actions.children.length, 1, 'expected exactly one explicit execute action');
    actions.children[0].click();
    await waitFor(() => ['SUCCESS','ERROR'].includes(document.getElementById('masterInputState').textContent), 'execute');
    return document.getElementById('masterInputState').textContent;
  }

  return {
    runtime,
    document,
    submit,
    execute,
    ui,
    requests,
    providerCalls:() => providerCalls,
    cleanup:() => deactivateRuntimeSession(runtime),
  };
}

module.exports = { setupProductionUi, transactionRecords };
