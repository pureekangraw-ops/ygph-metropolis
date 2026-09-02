const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const shell=fs.readFileSync(path.join(root,'ui/lighthouse-shell.mjs'),'utf8');

test('LIGHTHOUSE owns one top-level navigation state and destination registry',()=>{
  assert.match(shell,/const PAGE = Object\.freeze\(\{ CHAT:'chat', MANUAL:'manual', SETTINGS:'settings' \}\)/);
  assert.match(shell,/const MANUAL_DESTINATIONS = Object\.freeze\(/);
  assert.match(shell,/function applyNavigationState\(/);
  assert.match(shell,/function navigate\(/);
  assert.match(shell,/history\.pushState\(/);
  assert.match(shell,/history\.replaceState\(/);
});

test('browser or Android back restores the same LIGHTHOUSE navigation stack',()=>{
  assert.match(shell,/addEventListener\('popstate'/);
  assert.match(shell,/applyNavigationState\(event\.state/);
  assert.match(shell,/lighthouseManualBack[^\n]*addEventListener[\s\S]*history\.back\(\)/);
});

test('manual destinations are registered rather than free-form route strings',()=>{
  for(const destination of ['finance','store','ride'])assert.match(shell,new RegExp(`${destination}:`));
  assert.match(shell,/MANUAL_DESTINATIONS\[tile\.dataset\.manualDestination\]/);
});
