import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIGHTHOUSE_RUNTIME_FILES,
  stageLighthouseBundle,
} from '../../scripts/stage-lighthouse-next-bundle.mjs';

export const RUNTIME_FILES = LIGHTHOUSE_RUNTIME_FILES;

export async function stageLighthouseNext({ repoRoot, shellRoot }) {
  return stageLighthouseBundle({
    repoRoot,
    destinationRoot: join(shellRoot, 'www'),
  });
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath === modulePath) {
  const shellRoot = resolve(dirname(modulePath), '..');
  const repoRoot = resolve(shellRoot, '..');
  await stageLighthouseNext({ repoRoot, shellRoot });
  console.log('Staged shared LIGHTHOUSE runtime bundle for Android');
}
