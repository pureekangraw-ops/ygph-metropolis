import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  '../www/index.html',
  '../www/app/ui.html',
  '../www/app/logic.mjs',
  '../www/patch/patch-runtime.mjs',
  '../www/trusted/bootstrap.mjs',
];

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

test('canonical Android web entry and visible app identity are LIGHTHOUSE', async () => {
  const [index, ui] = await Promise.all([source('../www/index.html'), source('../www/app/ui.html')]);
  assert.match(index, /<title>LIGHTHOUSE<\/title>/);
  assert.match(index, /src=["']\.\/trusted\/bootstrap\.mjs["']/);
  assert.match(ui, />LIGHTHOUSE</);
  assert.doesNotMatch(index, /YGPH METROPOLIS/i);
  assert.doesNotMatch(ui, /YGPH METROPOLIS/i);
});

test('canonical Android runtime never requests the missing sw.js asset', async () => {
  for (const relative of files) {
    const text = await source(relative);
    assert.doesNotMatch(text, /serviceWorker\s*\.\s*register\s*\(/, `${relative} must not register a service worker in Android`);
    assert.doesNotMatch(text, /['"]\.\/sw\.js['"]/, `${relative} must not request ./sw.js`);
  }
});
