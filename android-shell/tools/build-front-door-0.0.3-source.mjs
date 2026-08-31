import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);

export async function buildFrontDoor003Source() {
  const [fixtureText, integrationLogic] = await Promise.all([
    readFile(new URL('test/fixtures/front-door-0.0.3-input.json', root), 'utf8'),
    readFile(new URL('release/front-door-0.0.3/logic.mjs', root), 'utf8'),
  ]);
  const fixture = JSON.parse(fixtureText);
  return {
    baseVersion: fixture.baseVersion,
    version: fixture.version,
    files: {
      ...fixture.files,
      'logic.mjs': integrationLogic,
    },
  };
}

async function main(argv) {
  const [outputPath] = argv;
  if (!outputPath) {
    throw new Error('Usage: node tools/build-front-door-0.0.3-source.mjs <output-json>');
  }
  const source = await buildFrontDoor003Source();
  await writeFile(outputPath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
