const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const cssPath = path.join(root, 'lighthouse-next/styles.css');
const appPath = path.join(root, 'lighthouse-next/app.mjs');
const stagingConfigPath = path.join(root, 'wrangler.lighthouse-next-staging.jsonc');
const deployWorkflowPath = path.join(root, '.github/workflows/greenfield-deploy-gate.yml');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('LIGHTHOUSE next demo ships the three isolated static source files', () => {
  assert.equal(fs.existsSync(htmlPath), true, 'missing lighthouse-next/index.html');
  assert.equal(fs.existsSync(cssPath), true, 'missing lighthouse-next/styles.css');
  assert.equal(fs.existsSync(appPath), true, 'missing lighthouse-next/app.mjs');
});

test('user surface is LIGHTHOUSE, Dashboard-first, with exactly four root nav labels', () => {
  const html = read(htmlPath);
  assert.match(html, /LIGHTHOUSE/);
  for (const label of ['เงินจริง', 'เงินเข้า', 'เงินออก', 'สุทธิ', 'ภาระใกล้ที่สุด', 'ยังขาด', 'เป้าวันนี้']) {
    assert.match(html, new RegExp(label));
  }
  const nav = html.match(/<nav id="bottom-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'bottom root navigation must exist');
  for (const label of ['หน้าหลัก', 'แชต', 'MANUAL', 'ตั้งค่า']) {
    const matches = nav.match(new RegExp(`>${label}<`, 'g')) || [];
    assert.equal(matches.length, 1, `${label} must appear exactly once in bottom root navigation`);
  }
  assert.equal((nav.match(/data-root-target=/g) || []).length, 4, 'bottom root navigation must contain exactly four root controls');
  assert.doesNotMatch(html, /เปิดแชต|เปิด MANUAL/);
});

test('normal demo surface hides architecture vocabulary and GO persona chrome', () => {
  const html = read(htmlPath);
  const visibleText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  assert.doesNotMatch(visibleText, /Module Registry|Ledger Gateway|durable readback|\bcapability\b|\bowner\b|\bactor\b|\bmanifest\b|GO\s*(ออนไลน์|online|avatar)/i);
});

test('demo persists only its own namespaced state and restores deep pending across reload', () => {
  const app = read(appPath);
  assert.match(app, /const STORAGE_KEY = ['"]lighthouse-next-demo-v1['"]/);
  assert.match(app, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(app, /restorePending/);
});

test('CHAT encodes Ambiguity Lock B-A-B-A and a supported local side-query reminder', () => {
  const app = read(appPath);
  assert.match(app, /AMBIGUITY_LOCK\s*=\s*['"]BABA['"]/);
  assert.match(app, /วันนี้วันที่เท่าไร/);
  assert.match(app, /ยังรอจำนวนของ/);
  assert.match(app, /answerLocalSideQuery/);
});

test('CHAT tells the user every remaining sale field instead of revealing one internal stage at a time', () => {
  const app = read(appPath);
  assert.match(app, /function missingIncomeFields/);
  assert.match(app, /บอกเพิ่มได้เลย/);
  for (const label of ['ได้เงินจากไหน', 'ขายอะไร', 'จำนวนกี่อัน']) assert.match(app, new RegExp(label));
  assert.match(app, /ข้อมูลที่รับแล้ว/);
  assert.match(app, /✓/);
  assert.match(app, /—/);
});

test('CHAT can parse a one-shot sale sentence and advance directly to sale confirmation when all fields are present', () => {
  const app = read(appPath);
  assert.match(app, /function parseIncomeDetails/);
  assert.match(app, /function applyIncomeDetails/);
  assert.match(app, /จากร้าน/);
  assert.match(app, /ขาย/);
  assert.match(app, /อัน/);
  assert.match(app, /CONFIRM_SALE/);
});

test('MANUAL exposes user jobs and Settings labels the environment as fake/local demo data', () => {
  const html = read(htmlPath);
  for (const label of ['การเงิน', 'ภาระ', 'ร้านค้า', 'งานวิ่ง', 'ปฏิทิน', 'รายการทั้งหมด']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /ข้อมูลจำลอง/);
  assert.match(html, /รีเซ็ตเดโม/);
});

test('demo staging is isolated from the production asset allowlist and verifies its own public URL', () => {
  const config = read(stagingConfigPath);
  const workflow = read(deployWorkflowPath);
  const productionIgnore = read(path.join(root, '.assetsignore'));

  assert.match(config, /"name"\s*:\s*"lighthouse-next-staging"/);
  assert.match(config, /"directory"\s*:\s*"\.\/lighthouse-next"/);
  assert.doesNotMatch(productionIgnore, /lighthouse-next/);
  assert.match(workflow, /wrangler\.lighthouse-next-staging\.jsonc/);
  assert.match(workflow, /https:\/\/lighthouse-next-staging\.pureekangraw\.workers\.dev/);
  assert.match(workflow, /LIGHTHOUSE/);
});