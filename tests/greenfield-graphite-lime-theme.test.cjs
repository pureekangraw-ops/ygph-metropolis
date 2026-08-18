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
  assert.match(css,/LIGHT = MEANING/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(boot,/theme\.css/);
  assert.doesNotMatch(css,/forest-theme|emerald-theme|calendar-theme|finance-theme/i);
});

test('brand and bottom navigation use direct coherent icon metaphors',()=>{
  const boot=read('ui/theme-shell.mjs');
  const icons=read('ui/icons.mjs');
  assert.match(boot,/brand-mark/);
  assert.doesNotMatch(boot,/yggdrasil-tree|tree-icon/i);
  for(const icon of ['house-simple','shopping-cart-simple','person-simple-run','wallet','calendar-dots']) assert.match(icons,new RegExp(`'${icon}'`));
  assert.match(boot,/store:\s*'shopping-cart-simple'/);
  assert.match(boot,/ride:\s*'person-simple-run'/);
});
