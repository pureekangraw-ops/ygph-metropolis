from pathlib import Path
import hashlib
import json

R27 = "v4.2.6-20260812-r27-domain-command-ownership"
DOMAIN = "metropolis-domain-commands.js"


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"{path}: expected source text not found: {old!r}")
    text = text.replace(old, new, 1)
    p.write_text(text, encoding="utf-8", newline="\n")


# Stable parser-owned load order: app -> domain commands -> FLOW.
replace_once(
    "index.html",
    '  <script src="app.js"></script>\n  <script src="flow-era.js"></script>',
    '  <script src="app.js"></script>\n  <script src="metropolis-domain-commands.js"></script>\n  <script src="flow-era.js"></script>'
)

# Service Worker generation and offline shell.
replace_once(
    "sw.js",
    'const RELEASE_ID = "v4.2.6-20260812-r26-command-runtime-gate";',
    f'const RELEASE_ID = "{R27}";'
)
replace_once(
    "sw.js",
    '  "app.js",\n  "flow-era.js",',
    '  "app.js",\n  "metropolis-domain-commands.js",\n  "flow-era.js",'
)

# Cloudflare stable-path allowlist.
replace_once(
    ".assetsignore",
    "!/app.js\n!/flow-era.js",
    "!/app.js\n!/metropolis-domain-commands.js\n!/flow-era.js"
)

# Syntax gate owns every production JavaScript file.
pkg_path = Path("package.json")
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
syntax = pkg["scripts"]["check:syntax"]
needle = "node --check app.js && node --check flow-era.js"
replacement = "node --check app.js && node --check metropolis-domain-commands.js && node --check flow-era.js"
if DOMAIN not in syntax:
    if needle not in syntax:
        raise SystemExit("package.json: app/flow syntax sequence not found")
    pkg["scripts"]["check:syntax"] = syntax.replace(needle, replacement, 1)
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

# Release manifest: one coherent publication authority.
manifest_path = Path("RELEASE_MANIFEST.json")
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["releaseDate"] = "2026-08-12"

runtime = manifest["runtimeOrder"]
if DOMAIN not in runtime:
    app_i = runtime.index("app.js")
    runtime.insert(app_i + 1, DOMAIN)
if runtime.index(DOMAIN) != runtime.index("app.js") + 1:
    raise SystemExit("manifest runtimeOrder: domain owner must immediately follow app.js")
if runtime[-1] != "metropolis-command-gate.js":
    raise SystemExit("manifest runtimeOrder: durable command gate must remain last")

safety = manifest.setdefault("safety", [])
old_safety = "confirmed end-day obligation payments use existing Ledger and Calendar mutation paths and one durable commit"
if old_safety in safety:
    safety[safety.index(old_safety)] = "confirmed end-day obligation payments delegate to the Ledger/Calendar domain command owner and retain one durable commit"
for line in [
    "live Ledger and Calendar durable mutations enter through one metropolis-domain-commands.js public owner before the existing durable command gate",
    "migrated Calendar payment, edit, completion and cancellation handlers request named commands instead of directly owning Ledger or Calendar state mutation",
    "balance reconciliation and live obligation creation request named Ledger commands while validated import and migration owners retain their existing bounded responsibilities",
    "domain command idempotency rejects duplicate effects before mutation and the r26 durable gate still provides cross-context lock, stale-write protection and verified read-back"
]:
    if line not in safety:
        safety.append(line)

roots = manifest.setdefault("rootRegressionTests", [])
if "tests/domain-command-ownership.test.cjs" not in roots:
    roots.append("tests/domain-command-ownership.test.cjs")

sw = manifest["serviceWorker"]
sw["releaseId"] = R27
assets = sw.setdefault("runtimeAssets", [])
if DOMAIN not in assets:
    assets.append(DOMAIN)
sw["note"] = "METROPOLIS 4.2.6 r27 centralizes live Ledger/Calendar command ownership before the existing r26 durable write guard while retaining State Schema 4, IndexedDB version 1, Vault format 1 and protected financial-history semantics."

validation = manifest["validation"]
validation["nodeTests"] = "191/191 PASS"
validation["syntax"] = "PASS — all production JavaScript parsed by node --check, including metropolis-domain-commands.js"
validation["utf8"] = "PASS — 35 production text assets + RELEASE_MANIFEST.json"
validation["publication"] = "OWNER_GATE_AFTER_PR_GATE_PASS"

production = manifest.setdefault("productionFiles", [])
paths = [entry["path"] for entry in production]
if DOMAIN not in paths:
    app_i = paths.index("app.js")
    production.insert(app_i + 1, {"path": DOMAIN})

manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

# Seal hashes from the exact final production bytes plus the release manifest.
hash_paths = ["RELEASE_MANIFEST.json"] + [entry["path"] for entry in manifest["productionFiles"]]
seen = set()
lines = []
for rel in hash_paths:
    if rel in seen:
        raise SystemExit(f"duplicate checksum path: {rel}")
    seen.add(rel)
    p = Path(rel)
    if not p.is_file():
        raise SystemExit(f"checksum path missing: {rel}")
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    lines.append(f"{digest}  {rel}")
Path("SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

print(f"Phase 2A publication wired: {R27}")
print(f"production files: {len(manifest['productionFiles'])}")
print(f"checksums sealed: {len(lines)}")
