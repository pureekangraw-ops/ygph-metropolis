import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stageLighthouseBundle } from './stage-lighthouse-next-bundle.mjs';

const root = process.cwd();
const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'lighthouse-utf8-'));
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest']);
const mojibake = /(?:\u00c2|\u00c3|\u00e0\u00b8|\u00e0\u00b9)/;

async function collect(dir, prefix = '') {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes:true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collect(full, relative));
    else out.push(relative);
  }
  return out;
}

try {
  await stageLighthouseBundle({ repoRoot:root, destinationRoot:destination });
  const files = (await collect(destination)).filter(file => textExtensions.has(path.extname(file)));
  const failures = [];
  for (const relative of files) {
    const content = await fs.readFile(path.join(destination, relative), 'utf8');
    if (content.includes('\uFFFD')) failures.push(`${relative}: replacement character`);
    if (mojibake.test(content)) failures.push(`${relative}: mojibake signature`);
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`UTF-8 gate PASS (${files.length} canonical LIGHTHOUSE bundle text files)`);
  }
} finally {
  await fs.rm(destination, { recursive:true, force:true });
}
