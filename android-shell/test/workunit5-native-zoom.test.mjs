import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyAndroidSecurityBaseline } from '../tools/apply-android-security.mjs';

test('android baseline disables WebView zoom controls in MainActivity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lighthouse-android-'));
  try {
    const main = join(root, 'app', 'src', 'main');
    const javaDir = join(main, 'java', 'com', 'yggdrasil', 'lighthouse');
    await mkdir(javaDir, { recursive:true });
    await writeFile(join(main, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>');
    await writeFile(join(javaDir, 'MainActivity.java'), 'package com.yggdrasil.lighthouse;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n}\n');

    await applyAndroidSecurityBaseline(root);
    const source = await readFile(join(javaDir, 'MainActivity.java'), 'utf8');
    assert.match(source, /setSupportZoom\(false\)/);
    assert.match(source, /setBuiltInZoomControls\(false\)/);
    assert.match(source, /setDisplayZoomControls\(false\)/);
  } finally {
    await rm(root, { recursive:true, force:true });
  }
});
