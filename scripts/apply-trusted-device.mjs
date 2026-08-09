import fs from "node:fs";

const appPath = "app.js";
let source = fs.readFileSync(appPath, "utf8");

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}
function replaceOnce(needle, replacement, label) {
  const found = count(source, needle);
  if (found !== 1) throw new Error(`${label}: expected 1 match, found ${found}`);
  source = source.replace(needle, replacement);
}

replaceOnce(
  'const ROLLBACK_META_KEY = "vault:rollback:metadata";\n',
  'const ROLLBACK_META_KEY = "vault:rollback:metadata";\nconst TRUSTED_DEVICE_KEY = "trusted-device:key";\nconst TRUSTED_DEVICE_VERSION = 1;\n',
  "trusted constants"
);

replaceOnce(
  'let hiddenAt = null;\nlet failedUnlocks = 0;\n',
  'let hiddenAt = null;\nlet trustedDeviceActive = false;\nlet failedUnlocks = 0;\n',
  "trusted runtime flag"
);

replaceOnce(
  'function dbPromoteVault(previousVault, candidateVault, metadata) {',
  `function dbDelete(key) {\n  return new Promise((resolve, reject) => {\n    const tx = db.transaction(DB_STORE, "readwrite");\n    tx.objectStore(DB_STORE).delete(key);\n    tx.oncomplete = () => resolve();\n    tx.onerror = () => reject(tx.error);\n  });\n}\nfunction dbPromoteVault(previousVault, candidateVault, metadata) {`,
  "dbDelete insertion"
);

const handlerStartMarker = '  byId("unlockForm").addEventListener("submit", async event => {';
const handlerEndMarker = '  byId("headerHome").onclick';
const handlerStart = source.indexOf(handlerStartMarker);
const handlerEnd = source.indexOf(handlerEndMarker, handlerStart);
if (handlerStart < 0 || handlerEnd < 0) throw new Error("unlock handler boundaries not found");
let handler = source.slice(handlerStart, handlerEnd);
const logicStartMarker = '      const decrypted = await decryptVault(vault, key);';
const logicEndMarker = '      failedUnlocks = 0; showApp();';
const logicStart = handler.indexOf(logicStartMarker);
const logicEndStart = handler.indexOf(logicEndMarker, logicStart);
if (logicStart < 0 || logicEndStart < 0) throw new Error("unlock logic boundaries not found");
const logicEnd = logicEndStart + logicEndMarker.length;
const rawLogic = handler.slice(logicStart, logicEnd);
const functionLogic = rawLogic.split("\n").map(line => line.startsWith("      ") ? `  ${line.slice(6)}` : line).join("\n");
const sharedUnlock = `async function unlockVaultWithKey(vault, key) {\n${functionLogic}\n}\n\n`;
handler = handler.slice(0, logicStart) + '      await unlockVaultWithKey(vault, key);' + handler.slice(logicEnd);
source = source.slice(0, handlerStart) + handler + source.slice(handlerEnd);

const showAppMarker = 'function showApp() {';
if (count(source, showAppMarker) !== 1) throw new Error("showApp marker mismatch");
const trustedHelpers = `function trustedDeviceMatchesVault(record, vault) {\n  return Boolean(\n    record &&\n    record.version === TRUSTED_DEVICE_VERSION &&\n    record.key &&\n    vault?.kdf &&\n    record.salt === vault.kdf.salt &&\n    Number(record.iterations) === Number(vault.kdf.iterations)\n  );\n}\n\nasync function rememberTrustedDevice(vault, key) {\n  if (!db || !vault?.kdf || !key) return false;\n  const record = {\n    version: TRUSTED_DEVICE_VERSION,\n    vaultVersion: Number(vault.version || VAULT_VERSION),\n    salt: vault.kdf.salt,\n    iterations: Number(vault.kdf.iterations),\n    key,\n    savedAt: nowIso()\n  };\n  try {\n    await dbPut(TRUSTED_DEVICE_KEY, record);\n    trustedDeviceActive = true;\n    clearTimeout(inactivityTimer);\n    return true;\n  } catch (error) {\n    trustedDeviceActive = false;\n    console.warn("Trusted-device key could not be stored", error);\n    return false;\n  }\n}\n\nasync function clearTrustedDevice() {\n  trustedDeviceActive = false;\n  if (!db) return;\n  try {\n    await dbDelete(TRUSTED_DEVICE_KEY);\n  } catch (error) {\n    console.warn("Trusted-device key could not be cleared", error);\n  }\n}\n\nasync function tryTrustedDeviceUnlock(vault) {\n  const record = await dbGet(TRUSTED_DEVICE_KEY);\n  if (!record) return false;\n  if (!trustedDeviceMatchesVault(record, vault)) {\n    await clearTrustedDevice();\n    return false;\n  }\n  try {\n    await unlockVaultWithKey(vault, record.key);\n    trustedDeviceActive = true;\n    return true;\n  } catch (error) {\n    console.warn("Trusted-device auto-unlock failed", error);\n    cryptoKey = null;\n    currentVault = null;\n    state = null;\n    await clearTrustedDevice();\n    return false;\n  }\n}\n\n`;
source = source.replace(showAppMarker, trustedHelpers + showAppMarker);

replaceOnce(
  '  renderAll();\n  resetInactivityTimer();\n',
  '  renderAll();\n  if (currentVault && cryptoKey) {\n    void rememberTrustedDevice(currentVault, cryptoKey).finally(resetInactivityTimer);\n  } else {\n    resetInactivityTimer();\n  }\n',
  "showApp remembers device"
);

replaceOnce(
  '  if (!state) return;\n  const minutes = Math.max(1, Number(state.settings.lockMinutes || 5));\n',
  '  if (!state || trustedDeviceActive) return;\n  const minutes = Math.max(1, Number(state.settings.lockMinutes || 5));\n',
  "inactivity lock yield"
);

replaceOnce(
  'if (state && hiddenAt && Date.now() - hiddenAt > 30000) lockApp("ล็อกหลังออกจากแอปเกิน 30 วินาที");',
  'if (state && !trustedDeviceActive && hiddenAt && Date.now() - hiddenAt > 30000) lockApp("ล็อกหลังออกจากแอปเกิน 30 วินาที");',
  "background lock yield"
);

replaceOnce(
  '  try { db = await openDb(); const vault = await dbGet(VAULT_KEY); if (vault) showUnlock(); else showSetup(); }\n',
  '  try {\n    db = await openDb();\n    const vault = await dbGet(VAULT_KEY);\n    if (!vault) { showSetup(); return; }\n    if (await tryTrustedDeviceUnlock(vault)) return;\n    showUnlock();\n  }\n',
  "startup trusted-device path"
);

const wireMarker = 'function wireEvents() {';
if (count(source, wireMarker) !== 1) throw new Error("wireEvents marker mismatch");
source = source.replace(wireMarker, sharedUnlock + wireMarker);

const changeStart = source.indexOf('async function changePassphrase() {');
if (changeStart < 0) throw new Error("changePassphrase not found");
const changeEnd = source.indexOf('\nfunction ', changeStart + 1);
if (changeEnd < 0) throw new Error("changePassphrase end not found");
let changeBlock = source.slice(changeStart, changeEnd);
const changeNeedle = '  lastDurableReadback = result.readback;\n  closeModal();';
if (count(changeBlock, changeNeedle) !== 1) throw new Error("changePassphrase readback marker mismatch");
changeBlock = changeBlock.replace(changeNeedle, '  lastDurableReadback = result.readback;\n  await rememberTrustedDevice(currentVault, cryptoKey);\n  closeModal();');
source = source.slice(0, changeStart) + changeBlock + source.slice(changeEnd);

fs.writeFileSync(appPath, source);

const oldRelease = "v4.2.4-20260809-r18-runtime-visual-followthrough";
const newRelease = "v4.2.4-20260809-r19-trusted-device-auto-unlock";
const publicationFiles = [
  "sw.js",
  "RELEASE_MANIFEST.json",
  "tests/defrag-publication-followthrough.test.cjs",
  "tests/icon-system.test.cjs",
  "tests/metropolis-4.2-schedule.test.cjs",
  "tests/metropolis-4.2.1-home-dashboard.test.cjs",
  "tests/metropolis-status-signal.test.cjs"
];
for (const file of publicationFiles) {
  let text = fs.readFileSync(file, "utf8");
  const matches = count(text, oldRelease);
  if (matches < 1) throw new Error(`${file}: missing old release id`);
  text = text.split(oldRelease).join(newRelease);
  if (file === "RELEASE_MANIFEST.json") {
    text = text.replace(
      /"note":\s*"([^"]*)"/,
      '"note": "METROPOLIS 4.2.4 keeps product/data behavior stable. r19 adds trusted-device auto-unlock using a non-extractable CryptoKey stored in this browser IndexedDB; the passphrase remains the fallback for recovery, migration, backup use, or cleared/stale device storage."'
    );
  }
  fs.writeFileSync(file, text);
}

console.log("trusted-device transform applied");
