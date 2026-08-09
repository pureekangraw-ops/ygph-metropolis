from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def write(name, text):
    (ROOT / name).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


flow = read("flow-era.js")
lock_svg = '  lock: \'<svg data-icon="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2"/></svg>\',\n'
flow = replace_once(flow, '  tree: \'<svg data-icon="tree"', lock_svg + '  tree: \'<svg data-icon="tree"', "shared lock glyph")
write("flow-era.js", flow)

v4 = read("metropolis-v4.js")
v4 = replace_once(
    v4,
    '    [document.querySelector("#unlockScreen h1"), METROPOLIS_NAME],\n    [document.querySelector(".brand-copy h1"), METROPOLIS_NAME]\n',
    '    [document.querySelector("#unlockScreen h1"), METROPOLIS_NAME]\n',
    "legacy brand writer",
)
v4 = replace_once(v4, '  if (title) title.textContent = "แอปของบิ๊ก";', '  if (title) title.textContent = "เข้าเมือง";', "launcher heading")
v4 = replace_once(
    v4,
    '  utilityBar.innerHTML = `\n    <button type="button" data-metropolis-open="report"><span>📊</span><b>รายงาน</b></button>\n    <button type="button" data-metropolis-open="settings"><span>⚙️</span><b>ตั้งค่า</b></button>`;',
    '  utilityBar.innerHTML = `\n    <button type="button" data-metropolis-open="report"><span class="metropolis-utility-icon">${metropolisIcon("report")}</span><b>รายงาน</b></button>\n    <button type="button" data-metropolis-open="settings"><span class="metropolis-utility-icon">${metropolisIcon("settings")}</span><b>ตั้งค่า</b></button>`;',
    "utility icons",
)
v4 = replace_once(
    v4,
    '  if (brandTitle) brandTitle.textContent = METROPOLIS_DISPLAY_NAME;\n  if (brandSub) brandSub.textContent = METROPOLIS_SIGNATURE;\n\n  const status = document.querySelector(".status-line");',
    '  if (brandTitle) brandTitle.textContent = METROPOLIS_DISPLAY_NAME;\n  if (brandSub) brandSub.textContent = METROPOLIS_SIGNATURE;\n  const brandMark = document.querySelector(".brand-mark");\n  if (brandMark) brandMark.innerHTML = metropolisIcon("app");\n  const headerHome = document.getElementById("headerHome");\n  if (headerHome) headerHome.innerHTML = metropolisIcon("home");\n  const headerLock = document.getElementById("headerLockBtn");\n  if (headerLock) headerLock.innerHTML = typeof flowIcon === "function" ? flowIcon("lock") : "";\n\n  const status = document.querySelector(".status-line");',
    "header icon hydration",
)
write("metropolis-v4.js", v4)

print("Final visual authority cleanup applied.")