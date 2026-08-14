from pathlib import Path
p = Path('sw.js')
text = p.read_text(encoding='utf-8')
old = "const ASSET_REVISION='sha256-54ef8090742c3adb';"
new = "const ASSET_REVISION='sha256-5b011fb44dd693ee';"
if old not in text and new not in text:
    raise SystemExit('unexpected sw.js asset revision')
if old in text:
    p.write_text(text.replace(old, new, 1), encoding='utf-8')
