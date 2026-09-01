"use strict";

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { for (const value of values) this.values.add(value); }
  remove(...values) { for (const value of values) this.values.delete(value); }
  toggle(value, force) {
    if (force === true) { this.values.add(value); return true; }
    if (force === false) { this.values.delete(value); return false; }
    if (this.values.has(value)) { this.values.delete(value); return false; }
    this.values.add(value); return true;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.classList = new FakeClassList();
    this.hidden = false;
    this._textContent = '';
    this.value = '';
    this.parentNode = null;
    this._id = '';
  }
  get id() { return this._id; }
  set id(value) { this._id = String(value || ''); if (this._id) this.ownerDocument.elements.set(this._id, this); }
  get textContent() { return this._textContent; }
  set textContent(value) {
    this._textContent = String(value ?? '');
    if (this.children) this.children = [];
  }
  setAttribute(name, value) {
    if (name === 'id') this.id = value;
    else if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = String(value);
    else this[name] = String(value);
  }
  append(...children) { for (const child of children) { if (typeof child === 'string') continue; child.parentNode = this; this.children.push(child); } }
  before(child) {
    const index = this.parentNode?.children.indexOf(this) ?? -1;
    if (index < 0) return;
    child.parentNode = this.parentNode;
    this.parentNode.children.splice(index, 0, child);
  }
  addEventListener(type, handler) { const list = this.listeners.get(type) || []; list.push(handler); this.listeners.set(type, list); }
  async click() { for (const handler of this.listeners.get('click') || []) await handler.call(this, {type:'click', target:this, currentTarget:this}); }
  querySelector(selector) {
    if (selector === 'button,input,select') return this.walk().find(node => ['BUTTON','INPUT','SELECT'].includes(node.tagName)) || null;
    return null;
  }
  focus() {}
  walk() { return [this, ...this.children.flatMap(child => child.walk())]; }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.head = new FakeElement('head', this);
    this.finance = new FakeElement('section', this);
    this.finance.dataset.areaPage = 'finance';
    const schedule = new FakeElement('section', this);
    schedule.id = 'financeSchedule';
    this.finance.append(schedule);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return this.elements.get(id) || null; }
  querySelector(selector) {
    if (selector === '[data-area-page="finance"]') return this.finance;
    return null;
  }
}

function createManual(records) {
  return {
    records,
    async getRecord(owner, recordId) { return structuredClone(this.records[`${owner}/${recordId}`] || null); },
    async history() { return []; },
    async related() { return []; },
    async incomeSummary() { return {actualSatang:0,target:null}; },
    async outcomeSummary() { return {actualSatang:0,ceiling:null}; },
    async searchLedger() { return []; },
    async calendarToday() { return []; },
    async calendarUpcoming() { return []; },
    async calendarOverdue() { return []; },
  };
}

module.exports = { FakeDocument, createManual };
