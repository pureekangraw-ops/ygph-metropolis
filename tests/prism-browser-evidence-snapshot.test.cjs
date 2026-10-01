const fs=require('node:fs');const assert=require('node:assert/strict');
const src=fs.readFileSync('prism/app.mjs','utf8');
const fn=src.match(/async function loadSnapshot\(\)\{[^\n]+\}/)?.[0]||'';
assert(fn.includes("if(browserEvidence?.verified)state.snapshot={...state.snapshot,browserEvidence}"),'verified Browser evidence must merge after bridge snapshot');
assert(fn.indexOf('state.snapshot=x')<fn.indexOf('state.snapshot={...state.snapshot,browserEvidence}'),'bridge snapshot must be applied before Browser evidence');
console.log('PRISM Browser evidence snapshot preservation contract: PASS');
