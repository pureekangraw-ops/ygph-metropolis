"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Graphite Lime has one token authority and semantic light states',()=>{
  const css=read('theme.css');
  const boot=read('ui/theme-shell.mjs');
  assert.match(css,/^@import url\('\.\/styles\.css'\);/);
  assert.match(css,/--graphite-950:/);
  assert.match(css,/--lime-primary:/);
  assert.match(css,/--semantic-warning:/);
  assert.match(css,/--semantic-danger:/);
  for(const token of ['area-home','area-store','area-ride','area-finance','area-system'])assert.match(css,new RegExp(`--${token}:`));
  assert.match(css,/LIGHT = MEANING/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(boot,/theme\.css/);
  assert.doesNotMatch(css,/forest-theme|emerald-theme|calendar-theme|finance-theme/i);
});

test('brand Home/Back and command navigation use direct coherent local icon metaphors',()=>{
  const html=read('index.html');
  const boot=read('ui/theme-shell.mjs');
  const icons=read('ui/icons.mjs');
  assert.match(html,/id="brandHomeMark"[^>]*class="brand-mark"/);
  assert.match(html,/id="brandBackIcon"[^>]*data-icon="arrow-left"/);
  assert.doesNotMatch(boot,/applyBrandMark|yggdrasil-tree|tree-icon/i);
  for(const icon of ['arrow-left','shopping-cart-simple','person-simple-run','wallet','gear-six']) assert.match(icons,new RegExp(`'${icon}'`));
  assert.match(boot,/store:\s*'shopping-cart-simple'/);
  assert.match(boot,/ride:\s*'person-simple-run'/);
  assert.match(boot,/finance:\s*'wallet'/);
  assert.match(boot,/\.command-nav-btn\[data-command-destination\]/);
  assert.doesNotMatch(boot,/home:\s*'house-simple'|bottom-nav-btn|data-destination/);
});
