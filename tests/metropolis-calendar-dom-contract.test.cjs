const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Calendar source omits cancelled controls instead of hiding compatibility nodes", () => {
  const index = read("index.html");
  const js = read("metropolis-r5-3.js");

  assert.doesNotMatch(index, /id="calCancelled"/);
  assert.doesNotMatch(index, /data-filter="CANCELLED"/);
  assert.match(index, /id="calendarPage"[\s\S]*?hero-grid r53-three-stats/);
  assert.doesNotMatch(js, /function hideCancelledControls/);
  assert.doesNotMatch(js, /getElementById\("calCancelled"\)/);
  assert.doesNotMatch(js, /data-filter="CANCELLED"/);
});
