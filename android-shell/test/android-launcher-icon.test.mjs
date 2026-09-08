import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { materializeAndroidIcons, APPROVED_ICON_SOURCE } from '../tools/materialize-android-icons.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');

test('launcher generation is anchored to the approved lighthouse artwork', async () => {
  assert.equal(APPROVED_ICON_SOURCE, 'lighthouse-next/assets/lighthouse-icon.svg');
  const root = await mkdtemp(join(tmpdir(), 'lh-icons-'));
  await materializeAndroidIcons({ repoRoot, androidRoot: root });

  const flat = await sharp(join(root, 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')).metadata();
  assert.equal(flat.width, 192);
  assert.equal(flat.height, 192);

  const foreground = await sharp(join(root, 'app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png')).metadata();
  assert.equal(foreground.width, 432);
  assert.equal(foreground.height, 432);
});

test('adaptive launcher resources keep the approved graphite background and foreground mapping', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lh-icons-'));
  await materializeAndroidIcons({ repoRoot, androidRoot: root });

  const adaptive = await readFile(join(root, 'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8');
  const round = await readFile(join(root, 'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'), 'utf8');
  const background = await readFile(join(root, 'app/src/main/res/values/ic_launcher_background.xml'), 'utf8');

  for (const xml of [adaptive, round]) {
    assert.match(xml, /@mipmap\/ic_launcher_foreground/);
    assert.match(xml, /@color\/ic_launcher_background/);
  }
  assert.match(background, /#0B0E14/);
});
