import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, base), 'utf8');
}

test('NEW BASE has its own browser entrypoint and does not load legacy UI or navigation', async () => {
  const html = await text('index.html');
  assert.match(html, /<div id="app"><\/div>/);
  assert.match(html, /<script type="module" src="\.\/main\.mjs"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css">/);
  assert.doesNotMatch(html, /\.\.\/ui\/|lighthouse-shell|compact-ui|app\.mjs/);
});

test('browser main boots only the NEW BASE browser app into #app', async () => {
  const source = await text('main.mjs');
  assert.match(source, /from '\.\/src\/browser-app\.mjs'/);
  assert.match(source, /document\.getElementById\('app'\)/);
  assert.match(source, /createBrowserApp/);
  assert.match(source, /\.start\(\)/);
  assert.doesNotMatch(source, /\.\.\/ui\/|greenfield\/ui|lighthouse-shell/);
});

test('browser main reads the assembled model from the active Runtime session instead of shipping placeholder money', async () => {
  const source = await text('main.mjs');
  assert.match(source, /from '\.\/src\/browser-model\.mjs'/);
  assert.match(source, /from '\.\.\/greenfield\/runtime-session\.mjs'/);
  assert.match(source, /from '\.\/src\/daily-controls\.mjs'/);
  assert.match(source, /createBrowserModel/);
  assert.match(source, /withRuntimeSession/);
  assert.match(source, /\.read\(/);
  assert.doesNotMatch(source, /manual:\s*\{\s*summary:\s*\{\}/s);
  assert.doesNotMatch(source, /income:\s*\{|outcome:\s*\{|ledger:\s*\{|calendar:\s*\{/);
});

test('NEW BASE stylesheet is mobile-first and reserves safe space for the only bottom navigation', async () => {
  const css = await text('styles.css');
  assert.match(css, /\.bottom-nav\s*\{/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /bottom:\s*0/);
  assert.match(css, /padding-bottom:\s*calc\(/);
  assert.match(css, /min-height:\s*44px/);
});
