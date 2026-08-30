"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('FD10 production Master Input carries LOCAL_MULTI_GROUP boxes separately and passes fresh durable revision into routing', () => {
  const ui = source('ui/master-input.mjs');
  assert.match(ui, /multi-group-frontdoor-runtime\.mjs/);
  assert.match(ui, /let\s+preparedMultiGroupRoute\s*=\s*null/);
  assert.match(ui, /withMasterRuntime\([\s\S]{0,500}state\.revision/);
  assert.match(ui, /routeMasterInputText\(text,[\s\S]{0,1000}baseRevision\s*:\s*routeContext\.baseRevision/);
  assert.match(ui, /routed\.route\s*===\s*['"]LOCAL_MULTI_GROUP['"]/);
  assert.match(ui, /preparedMultiGroupRoute\s*=\s*routed/);
  assert.match(ui, /routed\.commands[\s\S]{0,500}status/);
});

test('FD11 production execution revalidates frontdoor boxes and only presents completion from durable-proven COMPLETE', () => {
  const ui = source('ui/master-input.mjs');
  assert.match(ui, /executeFrontdoorMultiGroupBoxes\(runtime,\s*preparedMultiGroupRoute\)/);
  assert.match(ui, /result\.status\s*===\s*['"]COMPLETE['"]/);
  assert.match(ui, /result\.commands[\s\S]{0,500}status/);
  assert.match(ui, /preparedMultiGroupRoute\s*=\s*null/);
  assert.doesNotMatch(ui, /LOCAL_MULTI_GROUP[\s\S]{0,1200}SUCCESS[\s\S]{0,300}without readback/i);
});

test('FD12 frontdoor production modules are published and syntax-checked', () => {
  const manifest = JSON.parse(source('RELEASE_MANIFEST.json'));
  const production = new Set(manifest.productionFiles.map(item => item.path));
  assert.equal(production.has('lighthouse/multi-group-frontdoor.mjs'), true);
  assert.equal(production.has('lighthouse/multi-group-frontdoor-runtime.mjs'), true);

  const assetsIgnore = source('.assetsignore');
  assert.match(assetsIgnore, /!\/lighthouse\/multi-group-frontdoor\.mjs/);
  assert.match(assetsIgnore, /!\/lighthouse\/multi-group-frontdoor-runtime\.mjs/);

  const syntax = JSON.parse(source('package.json')).scripts['check:syntax'];
  assert.match(syntax, /node --check lighthouse\/multi-group-frontdoor\.mjs/);
  assert.match(syntax, /node --check lighthouse\/multi-group-frontdoor-runtime\.mjs/);
});
