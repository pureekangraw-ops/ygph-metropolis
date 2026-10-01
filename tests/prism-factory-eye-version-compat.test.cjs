const fs=require('node:fs');const assert=require('node:assert/strict');
const bg=fs.readFileSync('android-shell/native-prism-browser/factory-eye/background.js','utf8');
const mf=JSON.parse(fs.readFileSync('android-shell/native-prism-browser/factory-eye/manifest.json','utf8'));
assert(bg.includes("const VERSION = '0.3.0';"));
assert.equal(mf.version,'0.3.0');
console.log('Factory Eye GO Hub version compatibility: PASS');
