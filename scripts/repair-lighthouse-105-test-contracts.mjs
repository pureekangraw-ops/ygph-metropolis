import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// Restore the question suite exactly as it existed before the accidental broad edit,
// then change only the UI-fixture state expectation that intentionally moved to raw state.
const stableQuestionSuite = execFileSync('git', [
  'show',
  '2473e4b0dafdd87e17e77a98958eb0f046bb01f7:tests/greenfield-lighthouse-intent-question.test.cjs',
], { encoding:'utf8' });
const questionNeedle = "assert.equal(await env.submit('ลงข้าว1,50หรือยัง'), 'รอ');";
if (!stableQuestionSuite.includes(questionNeedle)) throw new Error('Q05 waiting expectation not found in stable suite');
writeFileSync('tests/greenfield-lighthouse-intent-question.test.cjs', stableQuestionSuite.replace(questionNeedle, "assert.equal(await env.submit('ลงข้าว1,50หรือยัง'), 'WAITING');"));

let finalGate = readFileSync('tests/greenfield-lighthouse-phase1-final-gate.test.cjs','utf8');
for (const [from,to] of [
  ["assert.equal(await env.submit('ข้าว 1,50'), 'รอ');", "assert.equal(await env.submit('ข้าว 1,50'), 'WAITING');"],
  ["assert.equal(await env.submit('แก้ไข 1,60'), 'รอ');", "assert.equal(await env.submit('แก้ไข 1,60'), 'WAITING');"],
]) {
  if (!finalGate.includes(from) && !finalGate.includes(to)) throw new Error(`final gate expectation not found: ${from}`);
  finalGate = finalGate.replace(from,to);
}
writeFileSync('tests/greenfield-lighthouse-phase1-final-gate.test.cjs',finalGate);

let settingsTest = readFileSync('tests/settings-utility.test.cjs','utf8');
settingsTest = settingsTest.replace(/assert\.match\(settings, \/กู้คืนจาก Backup\/\);/, "assert.match(settings, /กู้คืนจากข้อมูลสำรอง/);");
writeFileSync('tests/settings-utility.test.cjs',settingsTest);

let manual = readFileSync('ui/manual-finance-ui.mjs','utf8');
manual = manual.replace("label:'Complete'", "label:'เสร็จแล้ว'");
writeFileSync('ui/manual-finance-ui.mjs',manual);
