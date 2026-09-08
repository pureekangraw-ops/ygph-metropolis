const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const cssPath = path.join(root, 'lighthouse-next/styles.css');
const appPath = path.join(root, 'lighthouse-next/app.mjs');
const incomeParserPath = path.join(root, 'lighthouse-next/general-income.mjs');
const stagingConfigPath = path.join(root, 'wrangler.lighthouse-next-staging.jsonc');
const deployWorkflowPath = path.join(root, '.github/workflows/greenfield-deploy-gate.yml');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('LIGHTHOUSE next demo ships its isolated static source files', () => {
  assert.equal(fs.existsSync(htmlPath), true, 'missing lighthouse-next/index.html');
  assert.equal(fs.existsSync(cssPath), true, 'missing lighthouse-next/styles.css');
  assert.equal(fs.existsSync(appPath), true, 'missing lighthouse-next/app.mjs');
  assert.equal(fs.existsSync(incomeParserPath), true, 'missing lighthouse-next/general-income.mjs');
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
  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');
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
  assert.match(app, /ยังรอที่มาของรายรับ/);
  assert.match(app, /answerLocalSideQuery/);
});

test('CHAT general income asks only for amount plus source and never forces a store-or-ride selector', () => {
  const app = read(appPath);
  assert.match(app, /parseGeneralIncome/);
  assert.match(app, /รบกวนบอกเพิ่ม: ที่มาของรายรับ/);
  assert.match(app, /บันทึกไหม/);
  assert.match(app, /ทิป 59/);
  assert.match(app, /ขายมือถือ 566/);
  assert.doesNotMatch(app, /setChatActions\(\['ร้าน', 'วิ่ง', 'อย่างอื่น'\]\)/);
  assert.doesNotMatch(app, /ได้เงินจากไหน|ขายสินค้าหรือเงินเข้าร้านอย่างอื่น/);
});

test('CHAT confirmation and success copy read like conversation, not system output', () => {
  const app = read(appPath);
  assert.match(app, /บาท จาก\$\{pending\.source\} — บันทึกไหม\?/);
  assert.match(app, /บันทึกแล้ว \$\{pending\.amount\} บาท · \$\{pending\.source\}/);
  assert.doesNotMatch(app, /เดโมบันทึก:/);
  assert.doesNotMatch(app, /เป็นข้อมูลจำลองเท่านั้น ไม่มีข้อมูลจริงถูกเปลี่ยน/);
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

test('registered product sale parser locks product then value then quantity', async () => {
  const parserPath = path.join(root, 'lighthouse-next/store-sale.mjs');
  assert.equal(fs.existsSync(parserPath), true, 'missing lighthouse-next/store-sale.mjs');
  const { parseStoreSale } = await import(parserPath);
  const products = [
    { id: 'phone', name: 'มือถือ', aliases: ['โทรศัพท์', 'โทสับ'] },
    { id: 'case', name: 'เคสมือถือ', aliases: ['เคส'] },
  ];

  assert.deepEqual(parseStoreSale('ขายมือถือ 566', products), {
    productId: 'phone', productName: 'มือถือ', value: 566, quantity: null,
  });
  assert.deepEqual(parseStoreSale('ขายมือถือ 566 2', products), {
    productId: 'phone', productName: 'มือถือ', value: 566, quantity: 2,
  });
  assert.deepEqual(parseStoreSale('ขายเคสมือถือ 299 3', products), {
    productId: 'case', productName: 'เคสมือถือ', value: 299, quantity: 3,
  });
  assert.equal(parseStoreSale('ทิป 59', products), null);
});

test('Store sale flow is persisted, confirms before mutation, and protects stock truth', () => {
  const app = read(appPath);
  assert.match(app, /parseStoreSale/);
  assert.match(app, /kind:\s*['"]STORE_SALE['"]/);
  assert.match(app, /STORE_SALE_VALUE/);
  assert.match(app, /STORE_SALE_QUANTITY/);
  assert.match(app, /จำนวนไม่พอ|สินค้าไม่พอ/);
  assert.match(app, /transactions/);
  assert.match(app, /products/);
});

test('LIGHTHOUSE staging uses the owner-locked lighthouse artwork as app identity', () => {
  const html = read(htmlPath);
  const manifestPath = path.join(root, 'lighthouse-next/manifest.webmanifest');
  const iconPath = path.join(root, 'lighthouse-next/assets/lighthouse-icon.svg');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /assets\/lighthouse-icon\.svg/);
  assert.equal(fs.existsSync(manifestPath), true, 'missing lighthouse-next/manifest.webmanifest');
  assert.equal(fs.existsSync(iconPath), true, 'missing lighthouse-next/assets/lighthouse-icon.svg');
  const manifest = read(manifestPath);
  assert.match(manifest, /"name"\s*:\s*"LIGHTHOUSE"/);
  assert.match(manifest, /lighthouse-icon\.svg/);
});

test('Dashboard renders current demo cash truth from the shared state', () => {
  const html = read(htmlPath);
  const app = read(appPath);
  for (const id of ['home-cash-value', 'home-income-value', 'home-expense-value', 'home-net-value']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(app, /function renderHomeTruth\(/);
  assert.match(app, /state\.cash/);
  assert.match(app, /state\.todayIncome/);
  assert.match(app, /state\.todayExpense/);
});

test('MANUAL Store and History render the same products and transactions state', () => {
  const app = read(appPath);
  assert.match(app, /function renderStoreDetail\(/);
  assert.match(app, /function renderHistoryDetail\(/);
  assert.match(app, /state\.products/);
  assert.match(app, /state\.transactions/);
  assert.match(app, /เหลือ.*ชิ้น/);
});

test('sale cancellation is confirmed, append-only, and protected from double reversal', () => {
  const app = read(appPath);
  assert.match(app, /function ensureSaleReversalDialog\(/);
  assert.match(app, /ยกเลิกรายการ/);
  assert.match(app, /CANCELLED/);
  assert.match(app, /REVERSAL/);
  assert.match(app, /reversalOf/);
  assert.match(app, /showModal\(/);
  assert.doesNotMatch(app, /transactions\.splice\(/);
  assert.doesNotMatch(app, /transactions\s*=\s*state\.transactions\.filter/);
});

test('owner-locked app icon and transaction history have explicit mobile polish', () => {
  const html = read(htmlPath);
  const polishPath = path.join(root, 'lighthouse-next/owner-polish.css');
  assert.match(html, /owner-polish\.css/);
  assert.equal(fs.existsSync(polishPath), true, 'missing lighthouse-next/owner-polish.css');
  const polish = read(polishPath);
  assert.match(polish, /\.pin-app-icon\s*\{/);
  assert.match(polish, /aspect-ratio\s*:\s*1/);
  assert.match(polish, /object-fit\s*:\s*cover/);
  assert.match(polish, /\.history-cancel\s*\{/);
  assert.match(polish, /min-height\s*:\s*44px/);
});
