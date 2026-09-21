"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(ROOT, "lighthouse-next/control-port/transfer-form.mjs")).href;

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

test("LIGHTHOUSE transfer form uses the current 38 capability registry entries", async () => {
  const mod = await import(moduleUrl + "?catalog=" + Date.now());
  const capabilities = mod.listLighthouseTransferCapabilities();
  assert.equal(capabilities.length, 38);
  assert.equal(new Set(capabilities.map(item => item.id)).size, 38);
  assert.equal(capabilities[0].id, "system.health");
  assert.equal(capabilities.at(-1).id, "security.vault");
  assert.equal(capabilities.find(item => item.id === "finance.expense.create").editable, true);
  assert.equal(capabilities.find(item => item.id === "finance.balance").editable, false);
});

test("transfer envelope derives route locally and ignores route supplied by imported file", async () => {
  const mod = await import(moduleUrl + "?route=" + Date.now());
  const value = mod.normalizeLighthouseTransferEnvelope({
    contract:"lighthouse-transfer-v1",
    targetId:"lighthouse",
    requestId:"LH-EXPENSE-001",
    capabilityId:"finance.expense.create",
    route:{ owner:"WRONG", action:"wrong", readback:"wrong", confirmationRequired:false },
    payload:{ title:"ข้าว", amountBaht:65 },
  });

  assert.equal(value.route.owner, "GREENFIELD:LEDGER");
  assert.equal(value.route.action, "recordExpense");
  assert.equal(value.route.readback, "readLedgerTruth.transactions");
  assert.equal(value.route.confirmationRequired, true);
  assert.deepEqual(value.payload, { title:"ข้าว", amountBaht:65 });
});

test("read-only and DEVICE_SECURITY destinations cannot be imported as writes", async () => {
  const mod = await import(moduleUrl + "?blocked=" + Date.now());
  for (const capabilityId of ["finance.balance", "security.pin"]) {
    assert.throws(() => mod.createLighthouseTransferEnvelope({
      requestId:"LH-BLOCKED-001",
      capabilityId,
      payload:{},
    }), /LIGHTHOUSE_TRANSFER_CAPABILITY_NOT_WRITABLE/);
  }
});

test("submitting an imported transfer uses existing Control Port receive/process and keeps confirmation guard", async () => {
  const mod = await import(moduleUrl + "?submit=" + Date.now());
  const calls = [];
  const runtime = {
    receive(command) { calls.push(["receive", command]); return { ...command, status:"RECEIVED" }; },
    async process(requestId) {
      calls.push(["process", requestId]);
      return { requestId, capabilityId:"finance.expense.create", status:"BLOCKED", reason:"CONFIRMATION_REQUIRED" };
    },
    async refreshSnapshot() { calls.push(["refreshSnapshot"]); },
  };

  const result = await mod.submitLighthouseTransfer({
    runtime,
    envelope:{
      contract:"lighthouse-transfer-v1",
      targetId:"lighthouse",
      requestId:"LH-EXPENSE-002",
      capabilityId:"finance.expense.create",
      payload:{ title:"กาแฟ", amountBaht:55 },
    },
    dispatch() {},
  });

  assert.equal(result.receipt.reason, "CONFIRMATION_REQUIRED");
  assert.deepEqual(calls, [
    ["receive", {
      requestId:"LH-EXPENSE-002",
      capabilityId:"finance.expense.create",
      payload:{ title:"กาแฟ", amountBaht:55 },
    }],
    ["process", "LH-EXPENSE-002"],
  ]);
});

test("Settings exposes in-app import/export UI and app binds it to the live Control Port runtime", () => {
  const html = read("lighthouse-next/index.html");
  const app = read("lighthouse-next/app.mjs");
  const confirmation = read("lighthouse-next/control-port/control-port-confirmation.mjs");

  for (const token of [
    'id="lighthouse-transfer-toggle"',
    'id="lighthouse-transfer-form"',
    'id="lighthouse-transfer-capability"',
    'id="lighthouse-transfer-payload"',
    'id="lighthouse-transfer-import"',
    'id="lighthouse-transfer-export"',
    'id="lighthouse-transfer-file"',
  ]) assert.equal(html.includes(token), true, token);

  assert.match(html, /นำเข้าข้อมูลเข้า LIGHTHOUSE/);
  assert.match(html, /ส่งเข้า LIGHTHOUSE/);
  assert.match(html, /คำสั่งรอการยืนยันบนเครื่อง/);
  assert.match(app, /installLighthouseTransferForm\(\{ root, runtime:controlPortRuntime \}\)/);
  assert.match(confirmation, /lighthouse:control-port-updated/);
});

test("owner build increments for the in-app transfer surface", () => {
  const version = JSON.parse(read("android-shell/version.json"));
  assert.equal(version.versionCode, 1021);
  assert.equal(version.versionName, "1.0.0-owner.16");
});
