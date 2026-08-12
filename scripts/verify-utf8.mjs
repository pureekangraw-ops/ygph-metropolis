import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'RELEASE_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest']);
const files = [
  ...manifest.productionFiles.map(item => item.path).filter(file => textExtensions.has(path.extname(file))),
  'RELEASE_MANIFEST.json',
];
const unique = [...new Set(files)];
const mojibake = /(?:\u00c2|\u00c3|\u00e0\u00b8|\u00e0\u00b9)/;
const failures = [];
for (const relative of unique) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) { failures.push(`${relative}: missing`); continue; }
  const content = fs.readFileSync(full, 'utf8');
  if (content.includes('\uFFFD')) failures.push(`${relative}: replacement character`);
  if (mojibake.test(content)) failures.push(`${relative}: mojibake signature`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`UTF-8 gate PASS (${unique.length} text files)`);
