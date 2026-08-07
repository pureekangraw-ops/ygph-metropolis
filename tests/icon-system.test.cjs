const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function iconRuntime() {
  const source = read("flow-era.js");
  const start = source.indexOf("const FLOW_ICON_META =");
  const end = source.indexOf("function flowTimestamp", start);
  assert.ok(start >= 0 && end > start, "icon registry section missing");
  const context = {};
  vm.runInNewContext(`${source.slice(start, end)}; result = { FLOW_ICON_META, FLOW_ICONS, flowIcon };`, context);
  return context.result;
}

function pngDimensions(file) {
  const buffer = fs.readFileSync(path.join(root, file));
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${file} must be a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("primary app mark uses only the approved civic route palette and safe area", () => {
  const { FLOW_ICON_META, FLOW_ICONS } = iconRuntime();
  assert.equal(FLOW_ICON_META.app.subject, "app-route");
  assert.deepEqual(Array.from(FLOW_ICON_META.app.palette), ["#7188a2", "#46637f", "#ffffff"]);
  assert.match(FLOW_ICONS.app, /viewBox="0 0 24 24"/);
  assert.match(FLOW_ICONS.app, /fill="#7188a2"/);
  assert.match(FLOW_ICONS.app, /fill="#46637f"/);
  assert.match(FLOW_ICONS.app, /stroke="#ffffff"/);
  assert.doesNotMatch(FLOW_ICONS.app, /#(?:[0-9a-fA-F]{6})/g, { expected: ["#7188a2", "#46637f", "#ffffff"] });
});

test("install icons have exact dimensions and remain wired for manifest and offline use", () => {
  assert.deepEqual(pngDimensions("icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions("icon-512.png"), { width: 512, height: 512 });

  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })),
    [
      { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  );

  const { APP_SHELL } = require("../sw.js");
  assert.ok(APP_SHELL.includes("icon-192.png"));
  assert.ok(APP_SHELL.includes("icon-512.png"));
});

test("icon rollout advances beyond the already-deployed rescue cache generation", () => {
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  const { RELEASE_ID } = require("../sw.js");

  assert.equal(manifest.serviceWorker.releaseId, RELEASE_ID);
  assert.match(RELEASE_ID, /-r4-polish$/, "the polish rollout must advance beyond the deployed r3 cache");
});

test("approved subjects render from the shared icon registry", () => {
  const { FLOW_ICONS, flowIcon } = iconRuntime();
  const expected = {
    app: "app-route",
    store: "storefront",
    ride: "ride-route",
    ledger: "ledger",
    calendar: "calendar",
    settings: "settings"
  };
  for (const [name, subject] of Object.entries(expected)) {
    assert.ok(FLOW_ICONS[name], `${name} icon missing`);
    assert.match(flowIcon(name), new RegExp(`data-icon="${subject}"`));
  }
});

test("steel-blue treatment is limited to app-icon surfaces", () => {
  const css = `${read("flow-era.css")}\n${read("metropolis-v4.css")}`;
  const steelBlue = ["#7188a2", "#46637f"];
  for (const color of steelBlue) {
    const occurrences = [...css.matchAll(new RegExp(color, "gi"))];
    for (const occurrence of occurrences) {
      const start = Math.max(0, css.lastIndexOf("}", occurrence.index) + 1);
      const end = css.indexOf("{", start);
      const selector = css.slice(start, end).trim();
      assert.match(selector, /icon|brand-mark|metropolis-current-icon/i, `${color} leaked outside icon surface: ${selector}`);
    }
  }
});
