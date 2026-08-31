import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);

export async function buildFrontDoor004Source() {
  const logic = await readFile(new URL('release/front-door-0.0.4/logic.mjs', root), 'utf8');
  return {
    baseVersion: '0.0.3',
    version: '0.0.4',
    files: {
      'logic.mjs': logic,
    },
  };
}

async function main(argv) {
  const [outputPath] = argv;
  if (!outputPath) {
    throw new Error('Usage: node tools/build-front-door-0.0.4-source.mjs <output-json>');
  }
  const source = await buildFrontDoor004Source();
  await writeFile(outputPath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
