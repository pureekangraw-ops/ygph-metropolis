const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const chatPath = path.join(root, 'lighthouse-next', 'chat-path.mjs');
const appPath = path.join(root, 'lighthouse-next', 'app.mjs');

test('CHAT expense draft reuses the canonical Pattern request and preserves request identity', async () => {
  assert.equal(fs.existsSync(chatPath), true, 'missing lighthouse-next/chat-path.mjs');
  const { createExpenseDraft } = await import(chatPath);
  const draft = createExpenseDraft('ข้าว 65', { requestIdFactory:() => 'REQ-chat-expense-1' });

  assert.deepEqual(draft, {
    kind:'DIRECT_EXPENSE',
    stage:'CONFIRM_DIRECT_EXPENSE',
    requestId:'REQ-chat-expense-1',
    title:'ข้าว',
    amountSatang:6500,
  });
});

test('CHAT expense commit routes through the existing Path Kernel under the active Runtime session', async () => {
  const { commitExpenseDraft } = await import(chatPath);
  const draft = {
    kind:'DIRECT_EXPENSE',
    stage:'CONFIRM_DIRECT_EXPENSE',
    requestId:'REQ-chat-expense-1',
    title:'ข้าว',
    amountSatang:6500,
  };
  const runtime = { marker:'runtime' };
  let seen = null;
  const pathKernel = {
    async run(request, context) {
      seen = { request, context };
      return { status:'COMPLETE', route:'DIRECT', capabilityId:'EXPENSE_CREATE', source:'PATTERN', readback:{ recordId:'TX-LH-REQ-chat-expense-1' } };
    },
  };

  const result = await commitExpenseDraft(draft, {
    withSession: operation => operation(runtime),
    pathKernel,
  });

  assert.equal(result.status, 'COMPLETE');
  assert.equal(seen.context.runtime, runtime);
  assert.equal(seen.request.requestId, 'REQ-chat-expense-1');
  assert.equal(seen.request.fields.title, 'ข้าว');
  assert.equal(seen.request.fields.amountSatang, 6500);
  assert.equal(seen.request.requiredResult.effect.subtype, 'EXPENSE');
});

test('CHAT app keeps expense draft pending until COMPLETE durable readback', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /createExpenseDraft/);
  assert.match(app, /commitExpenseDraft/);
  assert.match(app, /DIRECT_EXPENSE/);
  assert.match(app, /CONFIRM_DIRECT_EXPENSE/);
  assert.match(app, /requestId/);
  assert.match(app, /result\?\.status\s*===\s*['"]COMPLETE['"]/);
  assert.match(app, /บันทึกอาจสำเร็จแล้ว แต่ยังอ่านกลับไม่ได้/);
  assert.match(app, /รายการยังค้างอยู่/);
});

test('staged LIGHTHOUSE bundle carries canonical Direct Path modules instead of a copied implementation', async () => {
  const { mkdtemp } = require('node:fs/promises');
  const { stageLighthouseBundle } = await import(path.join(root, 'scripts', 'stage-lighthouse-next-bundle.mjs'));
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), 'lh-chat-path-stage-'));
  await stageLighthouseBundle({ repoRoot:root, destinationRoot });

  for (const relative of [
    'lighthouse/path-contract.mjs',
    'lighthouse/path-kernel.mjs',
    'lighthouse/pattern-input.mjs',
    'lighthouse/capabilities/expense.mjs',
  ]) {
    assert.equal(fs.existsSync(path.join(destinationRoot, relative)), true, `missing staged ${relative}`);
  }
});
