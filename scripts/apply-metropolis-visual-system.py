from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def write(name, text):
    (ROOT / name).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 regex match, found {count}")
    return next_text


# 1) Shared icon authority: replace the old limited FLOW registry with the approved production-safe family.
flow = read("flow-era.js")
new_icons = r'''const FLOW_ICONS = {
  app: '<svg data-icon="app-metropolis-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path data-role="accent" d="M6 7 12 3l6 4"/><path data-role="primary" d="M6 20V9l6 5 6-5v11"/><path data-role="accent" d="m12 17.2.65 1.2 1.2.65-1.2.65-.65 1.2-.65-1.2-1.2-.65 1.2-.65Z" fill="currentColor" stroke="none"/></svg>',
  home: '<svg data-icon="home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 10.2V20h13v-9.8"/><path d="M9.3 20v-5.5h5.4V20"/></svg>',
  store: '<svg data-icon="storefront" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v9h16v-9"/><path d="M3 10l2-5h14l2 5"/><path d="M3 10c0 1.4 1 2.5 2.3 2.5S7.7 11.4 7.7 10c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0 1.4 1 2.5 2.3 2.5S21 11.4 21 10"/><path d="M9 19v-4h6v4"/></svg>',
  ride: '<svg data-icon="ride-route" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6.5" cy="16.5" r="2.4"/><circle cx="17.5" cy="16.5" r="2.4"/><path d="M8.9 16.5h3.2l2.4-6h3.8M11.2 10.5l1.2-3.5h3.2M12.4 7h3.2"/><path d="M3.8 12.5h6.1l2.2 4"/></svg>',
  ledger: '<svg data-icon="ledger-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="14" height="18" rx="2.5"/><path d="M9 3v18M4 7h4M4 12h4M4 17h4"/><path d="M14.7 8.2c-1.4 0-2.3.7-2.3 1.7 0 1.1 1 1.5 2.3 1.8s2.3.7 2.3 1.8c0 1-.9 1.8-2.4 1.8M14.7 6.9v9.8"/></svg>',
  calendar: '<svg data-icon="calendar-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>',
  settings: '<svg data-icon="settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.2 14.7l1.1 1.9-2.7 2.7-1.9-1.1a7 7 0 0 1-1.7.7l-.6 2.1H9.6L9 18.9a7 7 0 0 1-1.7-.7l-1.9 1.1-2.7-2.7 1.1-1.9a7 7 0 0 1-.7-1.7L1 12.4V8.6L3.1 8a7 7 0 0 1 .7-1.7L2.7 4.4l2.7-2.7 1.9 1.1A7 7 0 0 1 9 2.1L9.6 0h3.8l.6 2.1a7 7 0 0 1 1.7.7l1.9-1.1 2.7 2.7-1.1 1.9a7 7 0 0 1 .7 1.7l2.1.6v3.8l-2.1.6a7 7 0 0 1-.7 1.7Z" transform="scale(.82) translate(2.6 2.6)"/></svg>',
  wallet: '<svg data-icon="wallet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5h13.5A2.5 2.5 0 0 1 20 9v9H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M15 11h6v4h-6a2 2 0 0 1 0-4Z"/></svg>',
  stock: '<svg data-icon="stock-box" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
  task: '<svg data-icon="task" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="m8 9 1.4 1.4L12 7.8M8 15l1.4 1.4L12 13.8M13.5 10h2.8M13.5 16h2.8"/></svg>',
  payment: '<svg data-icon="payment" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18M7 15h4"/><circle cx="18" cy="17" r="3" fill="currentColor" stroke="none"/></svg>',
  chevron: '<svg data-icon="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  tree: '<svg data-icon="tree" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-8"/><path d="M12 14c-4.5 0-7-2.8-7-6 4.2-.5 7 1.1 7 6z"/><path d="M12 11c0-4.5 2.8-7 6-7 .5 4.2-1.1 7-6 7z"/><path d="M8 21h8"/></svg>'
};'''
flow = regex_once(flow, r'const FLOW_ICONS = \{[\s\S]*?\n\};\n\nfunction flowIcon', new_icons + '\n\nfunction flowIcon', "FLOW icon registry")
write("flow-era.js", flow)

# 2) V4 keeps data/provenance name untouched but gains separate visible brand authority and consumes FLOW icons only.
v4 = read("metropolis-v4.js")
v4 = replace_once(
    v4,
    'const METROPOLIS_NAME = "YGPH METROPOLIS";\nconst METROPOLIS_ARCHITECTURE = "FOUR_APP_CONNECTED_SUITE";',
    'const METROPOLIS_NAME = "YGPH METROPOLIS";\nconst METROPOLIS_DISPLAY_NAME = "METROPOLIS";\nconst METROPOLIS_SIGNATURE = "by YGPH — Yggdrasil Personal Helper";\nconst METROPOLIS_ARCHITECTURE = "FOUR_APP_CONNECTED_SUITE";',
    "visible brand constants",
)
new_icon_function = '''function metropolisIcon(app) {
  const meta = METROPOLIS_APPS[app] || METROPOLIS_APPS.store;
  const iconMap = { report: "task", sync: "payment" };
  const iconName = iconMap[app] || meta.icon || app;
  try {
    if (typeof flowIcon === "function") return flowIcon(iconName);
  } catch (error) {
    console.warn("Metropolis icon unavailable", error);
  }
  return "";
}'''
v4 = regex_once(v4, r'function metropolisIcon\(app\) \{[\s\S]*?\n\}\n\nfunction metropolisActivePage', new_icon_function + '\n\nfunction metropolisActivePage', "metropolisIcon")

anchor = '''function metropolisShowPage(page) {
  if (typeof showPage === "function") {
    showPage(page);
    return;
  }
  document.querySelectorAll(".page").forEach(node => node.classList.toggle("active", node.id === `${page}Page`));
  metropolisApplyPage(page);
}
'''
nav_helpers = anchor + '''
function metropolisHydrateBottomNav() {
  document.querySelectorAll(".bottom-nav .nav-btn[data-page]").forEach(button => {
    const page = button.dataset.page;
    const iconHost = button.querySelector("i");
    if (iconHost) iconHost.innerHTML = metropolisIcon(page);
  });
}

function metropolisSyncBottomNav(page = metropolisActivePage()) {
  document.querySelectorAll(".bottom-nav .nav-btn[data-page]").forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}
'''
v4 = replace_once(v4, anchor, nav_helpers, "bottom-nav helpers")
v4 = replace_once(v4, 'if (brandTitle) brandTitle.textContent = METROPOLIS_NAME;\n  if (brandSub) brandSub.textContent = "Four Apps. One Flow. — แยกเป็นแอป เชื่อมเป็นระบบ";', 'if (brandTitle) brandTitle.textContent = METROPOLIS_DISPLAY_NAME;\n  if (brandSub) brandSub.textContent = METROPOLIS_SIGNATURE;', "visible brand copy")
v4 = replace_once(v4, '  document.body.dataset.metropolisPage = normalized;\n\n  const bar = document.getElementById("metropolisAppBar");', '  document.body.dataset.metropolisPage = normalized;\n  metropolisSyncBottomNav(normalized);\n\n  const bar = document.getElementById("metropolisAppBar");', "nav state sync")
v4 = replace_once(v4, '  metropolisBuildLauncher();\n  metropolisBuildAppBar();', '  metropolisBuildLauncher();\n  metropolisBuildAppBar();\n  metropolisHydrateBottomNav();', "nav hydration install")
write("metropolis-v4.js", v4)

# 3) Existing bottom nav remains the only source; reorder/rename it instead of creating a second one.
index = read("index.html")
old_nav = '<nav class="bottom-nav"><button class="nav-btn" data-page="store"><i>🏪</i><span>ร้านค้า</span></button><button class="nav-btn" data-page="ride"><i>🛵</i><span>วิ่งงาน</span></button><button class="nav-btn home-center active" data-page="home"><i>⌂</i><span>หน้าหลัก</span></button><button class="nav-btn" data-page="ledger"><i>📒</i><span>การเงิน</span></button><button class="nav-btn" data-page="calendar"><i>📅</i><span>ปฏิทิน</span></button></nav>'
new_nav = '<nav class="bottom-nav" aria-label="เมนูหลัก"><button class="nav-btn active" data-page="home"><i aria-hidden="true"></i><span>Home</span></button><button class="nav-btn" data-page="store"><i aria-hidden="true"></i><span>Store</span></button><button class="nav-btn" data-page="ride"><i aria-hidden="true"></i><span>Ride</span></button><button class="nav-btn" data-page="ledger"><i aria-hidden="true"></i><span>Ledger</span></button><button class="nav-btn" data-page="calendar"><i aria-hidden="true"></i><span>Calendar</span></button></nav>'
index = replace_once(index, old_nav, new_nav, "bottom-nav source")
index = replace_once(index, '<meta name="theme-color" content="#176b4f">', '<meta name="theme-color" content="#0F1416">', "theme color")
write("index.html", index)

# 4) Compatibility layer no longer owns SVG geometry; it delegates to the shared icon authority.
r51 = read("metropolis-r5-1.js")
r51 = regex_once(r51, r'function metropolis41Icon\(app\) \{[\s\S]*?\n\}\n\nfunction metropolis41ApplyVersion', 'function metropolis41Icon(app) {\n  return typeof flowIcon === "function" ? flowIcon(app) : "";\n}\n\nfunction metropolis41ApplyVersion', "R5-1 icon delegation")
r51 = replace_once(r51, 'card.querySelectorAll(".metropolis-app-copy > small, .metropolis-app-status").forEach(node => node.remove());', 'card.querySelectorAll(".metropolis-app-status").forEach(node => node.remove());', "keep approved launcher subtitle")
write("metropolis-r5-1.js", r51)

# 5) V4 must no longer hide the canonical bottom nav.
v4css = read("metropolis-v4.css")
v4css = replace_once(v4css, '.metropolis-v4 .bottom-nav{display:none!important}', '.metropolis-v4 .bottom-nav{display:grid!important}', "show canonical bottom nav")
v4css = replace_once(v4css, '.metropolis-v4 main{padding-bottom:max(2rem,env(safe-area-inset-bottom))}', '.metropolis-v4 main{padding-bottom:calc(92px + env(safe-area-inset-bottom))}', "bottom nav safe padding")
write("metropolis-v4.css", v4css)

print("Asserted METROPOLIS visual transforms applied.")