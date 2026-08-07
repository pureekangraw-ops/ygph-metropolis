const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const runtime = require("../metropolis-r5-1.js");
const sw = require("../sw.js");

test("Metropolis product version advances to 4.1.0", () => {
  assert.equal(runtime.METROPOLIS_PRODUCT_VERSION, "4.1.0");
  assert.match(sw.RELEASE_ID, /^v4\.1\.0-20260807-r5-minimal$/);
});

test("launcher cleanup removes explanatory copy while retaining primary app content", () => {
  const js = read("metropolis-r5-1.js");
  const css = read("metropolis-r5-1.css");
  assert.match(js, /metropolis-city-copy > p/);
  assert.match(js, /metropolis-section-note/);
  assert.match(js, /metropolis-app-copy > small, \.metropolis-app-status/);
  assert.match(css, /\.metropolis-app-copy > small/);
  assert.match(css, /\.metropolis-app-status/);
});

test("launcher icons are simplified high-contrast SVG marks", () => {
  for (const app of ["store", "ride", "ledger", "calendar"]) {
    const svg = runtime.metropolis41Icon(app);
    assert.match(svg, new RegExp(`data-metropolis-41-icon="${app}"`));
    assert.match(svg, /stroke-width="4\.5"/);
    assert.doesNotMatch(svg, /<text/i);
  }
  const css = read("metropolis-r5-1.css");
  assert.match(css, /background:var\(--app-color\)!important/);
  assert.match(css, /color:#fff!important/);
});

test("4.1 launcher assets load after R5 and stay in the offline shell", () => {
  const bootstrap = read("sw-bootstrap.js");
  assert.ok(bootstrap.indexOf("metropolis-r5-1.css") > bootstrap.indexOf("metropolis-r5.css"));
  assert.ok(bootstrap.indexOf("metropolis-r5-1.js") > bootstrap.indexOf("metropolis-r5.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-1.css"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-1.js"));
});
