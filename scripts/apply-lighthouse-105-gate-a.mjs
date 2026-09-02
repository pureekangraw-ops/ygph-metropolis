import { readFileSync, writeFileSync } from 'node:fs';

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

replaceRequired('index.html', '<title>YGPH METROPOLIS</title>', '<title>LIGHTHOUSE</title>');
replaceRequired('index.html', '<strong>YGPH METROPOLIS</strong>', '<strong>LIGHTHOUSE</strong>');
replaceRequired("ui/lighthouse-shell.mjs", "document.title = 'LIGHT HOUSE';", "document.title = 'LIGHTHOUSE';");
replaceRequired("ui/lighthouse-shell.mjs", "title.textContent = 'LIGHT HOUSE';", "title.textContent = 'LIGHTHOUSE';");
replaceRequired("ui/lighthouse-shell.mjs", "nav.setAttribute('aria-label', 'LIGHT HOUSE navigation');", "nav.setAttribute('aria-label', 'LIGHTHOUSE navigation');");

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
