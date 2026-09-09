"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('extra-page pricing chooses the cheapest published package plus 70 baht per extra page', async () => {
  const { estimatePackage } = await import('../ui/go-client-flow.mjs');

  assert.deepEqual(estimatePackage({ pageCount:5 }), {
    package:'STARTER', priceBaht:490, pageCount:5, extraPages:0,
  });
  assert.deepEqual(estimatePackage({ pageCount:6 }), {
    package:'STARTER', priceBaht:560, pageCount:6, extraPages:1,
  });
  assert.deepEqual(estimatePackage({ pageCount:9 }), {
    package:'STARTER', priceBaht:770, pageCount:9, extraPages:4,
  });
  assert.deepEqual(estimatePackage({ pageCount:10 }), {
    package:'STANDARD', priceBaht:790, pageCount:10, extraPages:0,
  });
  assert.deepEqual(estimatePackage({ pageCount:11 }), {
    package:'STANDARD', priceBaht:860, pageCount:11, extraPages:1,
  });
  assert.deepEqual(estimatePackage({ pageCount:18 }), {
    package:'STANDARD', priceBaht:1350, pageCount:18, extraPages:8,
  });
  assert.deepEqual(estimatePackage({ pageCount:19 }), {
    package:'BUSINESS', priceBaht:1390, pageCount:19, extraPages:0,
  });
  assert.deepEqual(estimatePackage({ pageCount:23 }), {
    package:'BUSINESS', priceBaht:1600, pageCount:23, extraPages:3,
  });

  assert.deepEqual(estimatePackage({ pageCount:6, selectedPackage:'STARTER' }), {
    package:'STARTER', priceBaht:560, pageCount:6, extraPages:1,
    selectedPackage:'STARTER', packageMismatch:false,
  });
  assert.deepEqual(estimatePackage({ pageCount:10, selectedPackage:'STARTER' }), {
    package:'STANDARD', priceBaht:790, pageCount:10, extraPages:0,
    selectedPackage:'STARTER', packageMismatch:true,
  });
});

test('client surface blocks owner bootstrap instead of merely clearing auto-unlock PIN', () => {
  const rootApp = fs.readFileSync('app.mjs', 'utf8');
  assert.match(rootApp, /const isGoClientSurface\s*=\s*new URL\(globalThis\.location\.href\)\.searchParams\.get\(['"]surface['"]\)\s*===\s*['"]client['"]/);
  assert.match(rootApp, /if \(isGoClientSurface\)\s*\{[\s\S]*sessionStorage\.removeItem\(['"]metro-auto-unlock-pin['"]\)[\s\S]*\}\s*else\s*\{/);

  const clientGate = rootApp.indexOf('if (isGoClientSurface)');
  const bootstrapCall = rootApp.lastIndexOf('void bootstrapEntry()');
  assert.ok(clientGate >= 0 && bootstrapCall > clientGate, 'client gate must wrap the owner bootstrap path');
});

test('package mismatch adopts the recalculated package for subsequent API and manager context', () => {
  const clientSource = fs.readFileSync('ui/go-client.mjs', 'utf8');
  assert.match(clientSource, /if \(result\.packageMismatch\)[\s\S]*state\.estimate\s*=\s*result;[\s\S]*state\.package\s*=\s*result\.package;/);
});
