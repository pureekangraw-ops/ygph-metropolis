import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellRoot = resolve(here, '..');
const repoRoot = resolve(shellRoot, '..');
const www = resolve(shellRoot, 'www');

async function copyDir(name) {
  await cp(resolve(repoRoot, name), resolve(www, name), { recursive:true });
}

export async function stageNewBase() {
  await rm(www, { recursive:true, force:true });
  await mkdir(www, { recursive:true });
  for (const name of ['lighthouse-new-base', 'greenfield', 'lighthouse', 'master-input']) {
    await copyDir(name);
  }
  await writeFile(resolve(www, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./lighthouse-new-base/index.html"><title>LIGHTHOUSE</title>\n', 'utf8');
  await access(resolve(www, 'lighthouse-new-base', 'main.mjs'));
  await access(resolve(www, 'greenfield', 'runtime.mjs'));
  return { entry:'lighthouse-new-base/index.html' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await stageNewBase()));
}
