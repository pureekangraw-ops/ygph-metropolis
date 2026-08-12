const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const files = [
  "RELEASE_MANIFEST.json",
  "sw-bootstrap.js",
  "sw.js",
  "metropolis-command-gate.js"
];

test("print release hashes for checksum read-back", () => {
  for (const file of files) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
    console.log(`RELEASE_HASH ${digest}  ${file}`);
  }
});
