const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function pngSize(file) {
  const data = fs.readFileSync(path.join(root, file));
  assert.equal(data.subarray(1, 4).toString("ascii"), "PNG", `${file} must be a PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function iconRuntime() {
  const source = `${read("flow-era.js")}\n;globalThis.__iconTest = { FLOW_ICONS, flowIcon };`;
  const noop = () => {};
  const context = {
    document: { documentElement: { dataset: { flowInstalled: "true" } } },
    renderAll: noop,
    renderHome: noop,
    renderRide: noop,
    renderLedger: noop,
    renderCalendar: noop,
    renderSync: noop,
    renderSettings: noop,
    buildExchange: noop,
    validateImportProposal: noop,
    applyPendingImport: noop,
    cancelPendingImport: noop,
    persistAndRender: noop
  };
  vm.runInNewContext(source, context, { filename: "flow-era.js" });
  return context.__iconTest;
}

test("primary app mark uses the approved METROPOLIS palette and safe area", () => {
  const svg = read("assets/app-icon.svg");
  const colors = [...new Set(svg.match(/#[0-9a-f]{6}/gi)?.map(color => color.toUpperCase()))].sort();

  assert.match(svg, /viewBox="0 0 512 512"/);
  assert.match(svg, /data-icon="app-metropolis-mark"/);
  assert.match(svg, /data-safe-area="72 72 368 368"/);
  assert.deepEqual(colors, ["#0F1416", "#1B2326", "#22C55E", "#14B8A6", "#F5C14A"].sort());
  assert.doesNotMatch(svg, /gradient|jewel|crest|rune|shield|sigil|<text/i);
});

test("install icons have exact dimensions and remain wired for manifest and offline use", () => {
  assert.deepEqual(pngSize("icon-192.png"), [192, 192]);
  assert.deepEqual(pngSize("icon-512.png"), [512, 512]);

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

test("icon rollout follows the current Metropolis cache generation", () => {
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  const { RELEASE_ID } = require("../sw.js");

  assert.equal(manifest.serviceWorker.releaseId, RELEASE_ID);
  assert.match(RELEASE_ID, /^v4\.2\.5-/);
});

test("approved subjects render from the shared icon registry", () => {
  const { FLOW_ICONS, flowIcon } = iconRuntime();
  const expected = {
    app: "app-metropolis-mark",
    store: "storefront",
    ride: "ride-route",
    ledger: "ledger-book",
    calendar: "calendar-grid"
  };

  for (const [name, marker] of Object.entries(expected)) {
    assert.equal(typeof FLOW_ICONS[name], "string", `${name} icon is missing`);
    assert.match(FLOW_ICONS[name], new RegExp(`data-icon="${marker}"`));
    assert.match(flowIcon(name), new RegExp(`<span class="flow-icon">.*data-icon="${marker}"`));
  }

  assert.match(read("flow-era.js"), /querySelector\("\.brand-mark"\)\.innerHTML = flowIcon\("app"\)/);
});

test("authoritative visual layer owns the approved METROPOLIS palette", () => {
  const css = read("metropolis-r5-4.css");
  for (const [name, value] of [
    ["--ygph-deep", "#0F1416"],
    ["--ygph-slate", "#1B2326"],
    ["--ygph-emerald", "#22C55E"],
    ["--ygph-teal", "#14B8A6"],
    ["--ygph-gold", "#F5C14A"],
    ["--ygph-white", "#F7F7F8"]
  ]) {
    assert.match(css, new RegExp(`${name}:${value}`, "i"));
  }
  assert.match(css, /\.metropolis-v4 \.brand-mark/);
  assert.match(css, /\[data-role="primary"\]/);
  assert.match(css, /\[data-role="accent"\]/);
});