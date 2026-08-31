import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
export async function buildFrontDoor005Source() {
  const ui = await readFile(new URL('release/front-door-0.0.5/ui.html', root), 'utf8');
  const logic = await readFile(new URL('release/front-door-0.0.5/logic.mjs', root), 'utf8');
  return { baseVersion:'0.0.4', version:'0.0.5', files:{ 'ui.html':ui, 'logic.mjs':logic } };
}
async function main(argv) {
  const [outputPath] = argv;
  if (!outputPath) throw new Error('Usage: node tools/build-front-door-0.0.5-source.mjs <output-json>');
  await writeFile(outputPath, `${JSON.stringify(await buildFrontDoor005Source(), null, 2)}\n`, 'utf8');
}
const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
