const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("R5-3 hides the cancelled counter without deleting the base Calendar node", () => {
  const js = read("metropolis-r5-3.js");
  const match = js.match(/function hideCancelledControls\(\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(match, "hideCancelledControls must exist");
  const body = match[1];
  assert.match(body, /getElementById\("calCancelled"\)/);
  assert.match(body, /classList\.add\("hidden"\)/);
  assert.doesNotMatch(body, /tile\?\.remove\(\)/);
});
