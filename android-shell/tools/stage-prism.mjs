import { cp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageLighthouseBundle } from '../../scripts/stage-lighthouse-next-bundle.mjs';

const BRAND_FILES = ['index.html', 'manifest.webmanifest'];

export async function stagePrismBundle({ repoRoot, shellRoot }) {
  await stageLighthouseBundle({ repoRoot, destinationRoot: join(shellRoot, 'www') });
  const runtimeRoot = join(shellRoot, 'www', 'lighthouse-next');
  await cp(join(runtimeRoot, 'assets', 'lighthouse-icon.svg'), join(runtimeRoot, 'assets', 'prism-icon.svg'));
  await cp(join(runtimeRoot, 'assets', 'lighthouse-icon-maskable.svg'), join(runtimeRoot, 'assets', 'prism-icon-maskable.svg'));
  for (const relative of BRAND_FILES) {
    const target = join(runtimeRoot, relative);
    let text = await readFile(target, 'utf8');
    text = text.replaceAll('LIGHTHOUSE', 'PRISM').replaceAll('lighthouse-icon', 'prism-icon');
    await writeFile(target, text, 'utf8');
  }
  return { destination: join(shellRoot, 'www'), applicationId: 'com.yggdrasil.prism', appName: 'PRISM' };
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const shellRoot = resolve(modulePath, '..', '..');
  const repoRoot = resolve(shellRoot, '..');
  await stagePrismBundle({ repoRoot, shellRoot });
  console.log('Staged PRISM runtime bundle for Android');
}
