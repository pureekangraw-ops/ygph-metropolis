from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_RELEASE = "v4.2.4-20260809-r15-calendar-version-boundary"
NEW_RELEASE = "v4.2.4-20260809-r16-ygph-visual-system"


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def write(name, text):
    (ROOT / name).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


flow35 = read("flow-era-3.5.js")
old_nav = '''  function markBottomNavigation() {
    document.querySelectorAll(".bottom-nav .nav-btn").forEach(button => {
      const text = (button.textContent || "").replace(/\\s+/g, " ").trim();
      button.classList.remove("flow35-nav-store", "flow35-nav-ride", "flow35-nav-home", "flow35-nav-ledger", "flow35-nav-calendar");
      if (/ร้านค้า/.test(text)) button.classList.add("flow35-nav-store");
      else if (/วิ่งงาน/.test(text)) button.classList.add("flow35-nav-ride");
      else if (/หน้าหลัก/.test(text)) button.classList.add("flow35-nav-home");
      else if (/การเงิน/.test(text)) button.classList.add("flow35-nav-ledger");
      else if (/ปฏิทิน/.test(text)) button.classList.add("flow35-nav-calendar");
    });
  }
'''
new_nav = '''  function markBottomNavigation() {
    const allowed = new Set(["home", "store", "ride", "ledger", "calendar"]);
    document.querySelectorAll(".bottom-nav .nav-btn[data-page]").forEach(button => {
      const page = String(button.dataset.page || "").toLowerCase();
      button.classList.remove("flow35-nav-store", "flow35-nav-ride", "flow35-nav-home", "flow35-nav-ledger", "flow35-nav-calendar");
      if (allowed.has(page)) button.classList.add(`flow35-nav-${page}`);
    });
  }
'''
flow35 = replace_once(flow35, old_nav, new_nav, "FLOW 3.5 bottom-nav route ownership")
write("flow-era-3.5.js", flow35)

for file in [
    "tests/defrag-publication-followthrough.test.cjs",
    "tests/metropolis-4.2-schedule.test.cjs",
    "tests/metropolis-status-signal.test.cjs",
]:
    text = read(file)
    text = replace_once(text, OLD_RELEASE, NEW_RELEASE, f"{file} cache generation")
    write(file, text)

icon_test = read("tests/icon-system.test.cjs")
old_assert = '  assert.match(RELEASE_ID, /^v4\\.2\\.4-20260809-r(?:15-calendar-version-boundary|16-ygph-visual-system)$/);'
new_assert = f'  assert.equal(RELEASE_ID, "{NEW_RELEASE}");'
icon_test = replace_once(icon_test, old_assert, new_assert, "icon cache generation contract")
write("tests/icon-system.test.cjs", icon_test)

print("Visual publication follow-through finalized.")
