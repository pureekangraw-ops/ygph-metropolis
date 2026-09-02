import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const STABLE='2473e4b0dafdd87e17e77a98958eb0f046bb01f7';
function stable(path){
  return execFileSync('git',['show',`${STABLE}:${path}`],{encoding:'utf8'});
}
function requireAndReplace(source,from,to,label){
  if(!source.includes(from)) throw new Error(`${label} not found in stable suite`);
  return source.split(from).join(to);
}

// Rebuild the affected tests from the known-good 494-test baseline first.
// Then alter only assertions whose observable contract intentionally changed
// from translated UI text to stable machine state/action identifiers.
let questionSuite=stable('tests/greenfield-lighthouse-intent-question.test.cjs');
questionSuite=requireAndReplace(
  questionSuite,
  "assert.equal(await env.submit('ลงข้าว1,50หรือยัง'), 'รอ');",
  "assert.equal(await env.submit('ลงข้าว1,50หรือยัง'), 'WAITING');",
  'Q05 WAITING expectation',
);
writeFileSync('tests/greenfield-lighthouse-intent-question.test.cjs',questionSuite);

let finalGate=stable('tests/greenfield-lighthouse-phase1-final-gate.test.cjs');
finalGate=requireAndReplace(
  finalGate,
  "assert.equal(await env.submit('ข้าว 1,50'), 'รอ');",
  "assert.equal(await env.submit('ข้าว 1,50'), 'WAITING');",
  'P1F02/P1F04 WAITING expectation',
);
finalGate=requireAndReplace(
  finalGate,
  "assert.equal(await env.submit('แก้ไข 1,60'), 'รอ');",
  "assert.equal(await env.submit('แก้ไข 1,60'), 'WAITING');",
  'P1F02 second WAITING expectation',
);
writeFileSync('tests/greenfield-lighthouse-phase1-final-gate.test.cjs',finalGate);

let settingsTest=stable('tests/settings-utility.test.cjs');
settingsTest=requireAndReplace(
  settingsTest,
  'assert.match(settings, /กู้คืนจาก Backup/);',
  'assert.match(settings, /กู้คืนจากข้อมูลสำรอง/);',
  'Settings restore copy expectation',
);
writeFileSync('tests/settings-utility.test.cjs',settingsTest);

let bridgeTest=stable('tests/greenfield-manual-context-bridge.test.cjs');
bridgeTest=requireAndReplace(
  bridgeTest,
  "node.dataset.primaryAction === 'Complete'",
  "node.dataset.primaryAction === 'COMPLETED'",
  'Manual machine action identifier',
);
writeFileSync('tests/greenfield-manual-context-bridge.test.cjs',bridgeTest);
