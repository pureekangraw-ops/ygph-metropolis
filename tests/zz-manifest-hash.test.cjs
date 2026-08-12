const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

test("print final manifest hash", () => {
  const file = path.resolve(__dirname, "..", "RELEASE_MANIFEST.json");
  const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  console.log(`FINAL_MANIFEST_HASH ${digest}`);
});
