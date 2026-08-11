const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const files = ["RELEASE_MANIFEST.json", "metropolis-day-cycle.js", "sw-bootstrap.js", "sw.js"];

test("print day-cycle release hashes", () => {
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file));
    console.log(`DAY_CYCLE_SHA256 ${crypto.createHash("sha256").update(bytes).digest("hex")}  ${file}`);
  }
});
