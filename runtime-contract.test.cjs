const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("runtime extensions register hooks instead of wrapping global functions", () => {
  const app = read("app.js");
  const flow35 = read("flow-era-3.5.js");
  const metropolis = read("metropolis-v4.js");

  assert.match(app, /YGPHRuntime/);
  assert.match(app, /afterRender/);
  assert.match(app, /afterPageChange/);
  assert.match(flow35, /YGPHRuntime\.register/);
  assert.match(metropolis, /YGPHRuntime\.register/);

  assert.doesNotMatch(flow35, /wrapFunction|__flow35Wrapped|MutationObserver/);
  assert.doesNotMatch(metropolis, /metropolisWrapRuntime|__metropolisWrapped|MutationObserver/);
});

test("exchange and audit use the explicit transform contract", () => {
  const flow = read("flow-era.js");
  assert.match(flow, /YGPHRuntime\.transform\("exchange"/);
  assert.match(flow, /YGPHRuntime\.transform\("audit"/);
  assert.match(flow, /YGPHRuntime\.run\("afterRender"/);
});
