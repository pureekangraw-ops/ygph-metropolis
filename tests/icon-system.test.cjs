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

test("primary app mark uses only the approved civic route palette and safe area", () => {
  const svg = read("assets/app-icon.svg");
  const colors = [...new Set(svg.match(/#[0-9a-f]{6}/gi)?.map(color => color.toUpperCase()))].sort();

  assert.match(svg, /viewBox="0 0 512 512"/);
  assert.match(svg, /data-icon="app-route"/);
  assert.match(svg, /data-safe-area="72 72 368 368"/);
  assert.deepEqual(colors, ["#465B71", "#60758C", "#F7F5EF"].sort());
  assert.doesNotMatch(svg, /gradient|#(?:D4AF37|FFD700)|gold|jewel|crest|rune|shield|sigil|<text/i);
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

test("icon rollout advances beyond the already-deployed rescue cache generation", () => {
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  const { RELEASE_ID } = require("../sw.js");

  assert.equal(manifest.serviceWorker.releaseId, RELEASE_ID);
  assert.match(RELEASE_ID, /^v4\.1\.0-.*-r5-minimal$/, "the 4.1 launcher rollout must advance beyond r4-polish");
});

test("approved subjects render from the shared icon registry", () => {
  const { FLOW_ICONS, flowIcon } = iconRuntime();
  const expected = {
    app: "app-route",
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

test("steel-blue treatment is limited to app-icon surfaces", () => {
  const css = read("metropolis-v4.css");
  assert.match(css, /--metro-icon-bg:#60758C;/);
  assert.match(css, /--metro-icon-bg-dark:#465B71;/);
  assert.match(css, /--metro-icon-ink:#F7F5EF;/);

  const launcherRule = css.match(/\.metropolis-app-icon\{([^}]*)\}/)?.[1] || "";
  assert.match(launcherRule, /background:var\(--metro-icon-bg\)/);
  assert.match(launcherRule, /color:var\(--metro-icon-ink\)/);
  assert.doesNotMatch(launcherRule, /var\(--app-color\)/);

  const brandRule = css.match(/\.metropolis-v4 \.brand-mark\{([^}]*)\}/)?.[1] || "";
  assert.match(brandRule, /background:var\(--metro-icon-bg\)/);
  assert.match(brandRule, /color:var\(--metro-icon-ink\)/);

  for (const variable of ["--metro-store", "--metro-ride", "--metro-ledger", "--metro-calendar"]) {
    assert.match(css, new RegExp(`${variable}:`), `${variable} must remain available to the existing UI`);
  }
});
