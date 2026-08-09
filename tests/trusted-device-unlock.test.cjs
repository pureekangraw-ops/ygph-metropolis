"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("trusted-device unlock stores a non-extractable CryptoKey contract, never a passphrase", () => {
  assert.match(app, /const TRUSTED_DEVICE_KEY\s*=\s*"trusted-device:key"/);
  assert.match(app, /async function rememberTrustedDevice\(/);
  assert.match(app, /dbPut\(TRUSTED_DEVICE_KEY/);
  assert.match(app, /deriveKey\([\s\S]*?AES-GCM[\s\S]*?false, \["encrypt", "decrypt"\]/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*(?:pass|password|passphrase)/i);
  assert.doesNotMatch(app, /sessionStorage\.setItem\([^\n]*(?:pass|password|passphrase)/i);
  assert.doesNotMatch(app, /crypto\.subtle\.exportKey/);
});

test("startup tries the trusted device before showing the password fallback", () => {
  assert.match(app, /async function unlockVaultWithKey\(/);
  assert.match(app, /async function tryTrustedDeviceUnlock\(/);
  assert.match(app, /tryTrustedDeviceUnlock\(vault\)/);
  const initBody = app.match(/async function init\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(initBody.indexOf("tryTrustedDeviceUnlock(vault)") >= 0);
  assert.ok(initBody.indexOf("tryTrustedDeviceUnlock(vault)") < initBody.indexOf("showUnlock()"));
});

test("successful app entry remembers this device and automatic inactivity locks yield to device security", () => {
  const showAppBody = app.match(/function showApp\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert.match(showAppBody, /rememberTrustedDevice\(currentVault, cryptoKey\)/);
  const inactivityBody = app.match(/function resetInactivityTimer\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert.match(inactivityBody, /trustedDeviceActive/);
  assert.match(app, /if \(state && !trustedDeviceActive && hiddenAt/);
});

test("trusted-device record is bound to the current vault KDF and stale keys fall back safely", () => {
  assert.match(app, /vault\.kdf\.salt/);
  assert.match(app, /vault\.kdf\.iterations/);
  assert.match(app, /async function clearTrustedDevice\(/);
  assert.match(app, /await clearTrustedDevice\(\)/);
  assert.match(app, /showUnlock\(\)/);
});
