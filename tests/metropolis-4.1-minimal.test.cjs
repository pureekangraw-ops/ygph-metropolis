const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const runtime = require("../metropolis-r5-1.js");
const sw = require("../sw.js");

test("Metropolis 4.1 compatibility layer retains its own version marker", () => {
  assert.equal(runtime.METROPOLIS_PRODUCT_VERSION, "4.1.0");
});

test("launcher cleanup removes obsolete chrome while retaining the approved subtitle", () => {
  const js = read("metropolis-r5-1.js");
  const css = read("metropolis-r5-1.css");
  assert.match(js, /metropolis-city-copy > p/);
  assert.match(js, /metropolis-section-note/);
  assert.match(js, /metropolis-app-status/);
  assert.match(js, /metropolis-open-mark/);
  assert.doesNotMatch(js, /metropolis-app-copy > small/);
  assert.doesNotMatch(css, /\.metropolis-app-copy > small/);
});

test("launcher icon compatibility delegates to the shared FLOW icon authority", () => {
  const js = read("metropolis-r5-1.js");
  const css = read("metropolis-r5-1.css");
  assert.match(js, /return typeof flowIcon === "function" \? flowIcon\(app\) : ""/);
  assert.doesNotMatch(js, /data-metropolis-41-icon/);
  assert.match(css, /\.flow-icon/);
  assert.doesNotMatch(css, /\.metropolis-41-icon/);
});

test("4.1 launcher assets load after R5 and stay in the offline shell", () => {
  const bootstrap = read("sw-bootstrap.js");
  assert.ok(bootstrap.indexOf("metropolis-r5-1.css") > bootstrap.indexOf("metropolis-r5.css"));
  assert.ok(bootstrap.indexOf("metropolis-r5-1.js") > bootstrap.indexOf("metropolis-r5.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-1.css"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-1.js"));
});
