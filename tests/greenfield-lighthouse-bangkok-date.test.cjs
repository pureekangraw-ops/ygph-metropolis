const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const modulePath = path.join(root, 'lighthouse-next/bangkok-date.mjs');

test('LIGHTHOUSE date follows Asia/Bangkok across the UTC day boundary', async () => {
  assert.equal(fs.existsSync(modulePath), true, 'missing lighthouse-next/bangkok-date.mjs');
  const { formatThaiBangkokDate } = await import(modulePath);

  const beforeBangkokMidnight = new Date('2026-09-06T16:59:00.000Z');
  const afterBangkokMidnight = new Date('2026-09-06T17:01:00.000Z');

  assert.match(formatThaiBangkokDate(beforeBangkokMidnight), /6\s*ก\.ย\.\s*2569/);
  assert.match(formatThaiBangkokDate(afterBangkokMidnight), /7\s*ก\.ย\.\s*2569/);
});
