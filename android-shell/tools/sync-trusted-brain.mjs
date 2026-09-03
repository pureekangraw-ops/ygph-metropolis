import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_DIRECTORIES = Object.freeze(['lighthouse', 'greenfield']);

function pathValue(value) {
  if (value instanceof URL) return fileURLToPath(value);
  return resolve(String(value));
}

export async function syncTrustedBrainSources({
  repoRoot = new URL('../../', import.meta.url),
  destination = new URL('../www/trusted/source/', import.meta.url),
  directories = DEFAULT_DIRECTORIES,
} = {}) {
  const rootPath = pathValue(repoRoot);
  const destinationPath = pathValue(destination);
  const names = [...directories];

  await rm(destinationPath, { recursive:true, force:true });
  await mkdir(destinationPath, { recursive:true });

  for (const name of names) {
    const source = join(rootPath, name);
    const target = join(destinationPath, name);
    await mkdir(dirname(target), { recursive:true });
    await cp(source, target, { recursive:true, force:true, errorOnExist:false });
  }

  return Object.freeze({ destination:destinationPath, directories:names });
}

async function main() {
  const result = await syncTrustedBrainSources();
  console.log(`Synced trusted source: ${result.directories.join(', ')} -> ${result.destination}`);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
