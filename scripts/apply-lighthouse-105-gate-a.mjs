import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function replaceRequired(path, from, to) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(from)) {
    if (source.includes(to)) return false;
    throw new Error(`${path}: expected source fragment not found: ${from}`);
  }
  writeFileSync(path, source.replace(from, to));
  return true;
}

function appendOnce(path, marker, block) {
  const source = readFileSync(path, 'utf8');
  if (source.includes(marker)) return false;
  writeFileSync(path, `${source.trimEnd()}\n\n${block.trim()}\n`);
  return true;
}

function refreshAssetRevision() {
  const manifestPath = 'RELEASE_MANIFEST.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const hash = createHash('sha256');
  const paths = manifest.productionFiles.map(item => item.path).filter(file => file !== 'sw.js').sort();
  for (const file of paths) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  const revision = `sha256-${hash.digest('hex').slice(0, 16)}`;
  manifest.serviceWorker.assetRevision = revision;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const sw = readFileSync('sw.js', 'utf8');
  writeFileSync('sw.js', sw.replace(/const ASSET_REVISION='sha256-[0-9a-f]+';/, `const ASSET_REVISION='${revision}';`));
}

replaceRequired('index.html', '<title>YGPH METROPOLIS</title>', '<title>LIGHTHOUSE</title>');
replaceRequired('index.html', '<strong>YGPH METROPOLIS</strong>', '<strong>LIGHTHOUSE</strong>');
replaceRequired("ui/lighthouse-shell.mjs", "document.title = 'LIGHT HOUSE';", "document.title = 'LIGHTHOUSE';");
replaceRequired("ui/lighthouse-shell.mjs", "title.textContent = 'LIGHT HOUSE';", "title.textContent = 'LIGHTHOUSE';");
replaceRequired("ui/lighthouse-shell.mjs", "nav.setAttribute('aria-label', 'LIGHT HOUSE navigation');", "nav.setAttribute('aria-label', 'LIGHTHOUSE navigation');");
replaceRequired('tests/greenfield-login-ux.test.cjs', 'assert.match(header,/YGPH METROPOLIS/);', 'assert.match(header,/LIGHTHOUSE/);');

appendOnce('lighthouse.css', '/* LIGHTHOUSE 1.0.5 Gate A: mobile shell ownership */', `
/* LIGHTHOUSE 1.0.5 Gate A: mobile shell ownership */
html,
body{min-height:100%;}
body.lighthouse-shell-active{
  min-height:100dvh;
  padding-top:env(safe-area-inset-top);
}
body.lighthouse-shell-active .appbar{
  padding-top:env(safe-area-inset-top);
}
body.lighthouse-shell-active #workspace{
  min-height:calc(100dvh - env(safe-area-inset-top));
}
body.lighthouse-shell-active #workspace[data-lighthouse-view="chat"]{
  min-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
}
body.lighthouse-shell-active #workspace[data-lighthouse-view="chat"]>#masterInputShell{
  min-height:0;
  flex:1 1 auto;
}
body.lighthouse-shell-active #workspace[data-lighthouse-view="chat"] .master-input-shell{
  min-height:0;
  max-height:calc(100dvh - 9.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  overflow-y:auto;
  overscroll-behavior:contain;
}
.lighthouse-bottom-nav button{min-height:54px;min-width:44px;}
`);

refreshAssetRevision();
