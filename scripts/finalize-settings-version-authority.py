from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_RELEASE = "v4.2.4-20260809-r16-ygph-visual-system"
NEW_RELEASE = "v4.2.4-20260809-r17-settings-version-authority"


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def write(name, text):
    (ROOT / name).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


index = read("index.html")
index = replace_once(
    index,
    '<div class="hero-value">YGPH METROPOLIS v4.0.0</div>',
    '<div class="hero-value" id="settingsProductVersion">METROPOLIS</div>',
    "settings product-version placeholder",
)
write("index.html", index)

r54 = read("metropolis-r5-4.js")
r54 = replace_once(
    r54,
    'const METROPOLIS_R5_4_VERSION = "5.4.5-ygph-visual-system";',
    'const METROPOLIS_R5_4_VERSION = "5.4.6-settings-version-authority";',
    "R5-4 internal version",
)
r54 = replace_once(
    r54,
    '''  if (statusVersion) {\n    const expectedVersion = `METROPOLIS v${METROPOLIS_424_PRODUCT_VERSION}`;\n    if (statusVersion.textContent !== expectedVersion) statusVersion.textContent = expectedVersion;\n    statusVersion.setAttribute("aria-label", expectedVersion);\n  }\n''',
    '''  const expectedVersion = `METROPOLIS v${METROPOLIS_424_PRODUCT_VERSION}`;\n  if (statusVersion) {\n    if (statusVersion.textContent !== expectedVersion) statusVersion.textContent = expectedVersion;\n    statusVersion.setAttribute("aria-label", expectedVersion);\n  }\n  const settingsVersion = document.getElementById("settingsProductVersion");\n  if (settingsVersion && settingsVersion.textContent !== expectedVersion) settingsVersion.textContent = expectedVersion;\n''',
    "shared visible version writer",
)
write("metropolis-r5-4.js", r54)

# Every current reference to the visual rollout cache generation must move together.
text_suffixes = {".js", ".cjs", ".mjs", ".json", ".md", ".html", ".css"}
changed = []
occurrences = 0
for path in ROOT.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in text_suffixes:
        continue
    if ".git" in path.parts or path.name == Path(__file__).name:
        continue
    text = path.read_text(encoding="utf-8")
    count = text.count(OLD_RELEASE)
    if not count:
        continue
    occurrences += count
    path.write_text(text.replace(OLD_RELEASE, NEW_RELEASE), encoding="utf-8")
    changed.append(str(path.relative_to(ROOT)))

if occurrences < 6:
    raise SystemExit(f"cache generation: expected at least 6 current references, found {occurrences}: {changed}")

remaining = []
for path in ROOT.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in text_suffixes:
        continue
    if ".git" in path.parts:
        continue
    if OLD_RELEASE in path.read_text(encoding="utf-8"):
        remaining.append(str(path.relative_to(ROOT)))
if remaining:
    raise SystemExit(f"stale r16 references remain: {remaining}")

print(f"Settings version authority applied; moved {occurrences} cache references to r17 across {changed}.")
