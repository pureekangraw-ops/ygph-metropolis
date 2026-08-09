"use strict";

const METROPOLIS_PRODUCT_VERSION = "4.1.0";
const METROPOLIS_R5_1_VERSION = "5.1.0-minimal-launcher";

function metropolis41Icon(app) {
  const common = `class="metropolis-41-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-metropolis-41-icon="${app}"`;
  if (app === "store") return `<svg ${common}><path d="M8 19h32l-4-9H12l-4 9Z"/><path d="M11 19v19h26V19"/><path d="M18 38V27h12v11"/></svg>`;
  if (app === "ride") return `<svg ${common}><circle cx="13" cy="35" r="5"/><circle cx="36" cy="35" r="5"/><path d="M13 35h10l5-12h7"/><path d="M21 23h8l5 12"/><path d="M24 15h7"/></svg>`;
  if (app === "ledger") return `<svg ${common}><rect x="10" y="7" width="28" height="34" rx="4"/><path d="M17 7v34M22 17h10M22 25h10M22 33h7"/></svg>`;
  if (app === "calendar") return `<svg ${common}><rect x="7" y="10" width="34" height="31" rx="5"/><path d="M7 20h34M15 6v8M33 6v8M15 28h5M28 28h5M15 35h5M28 35h5"/></svg>`;
  return "";
}

function metropolis41ApplyVersion() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.metropolisR52) return;
  document.documentElement.dataset.metropolisVersion = METROPOLIS_PRODUCT_VERSION;
  document.documentElement.dataset.metropolisR51 = METROPOLIS_R5_1_VERSION;
  document.title = `YGPH METROPOLIS v${METROPOLIS_PRODUCT_VERSION}`;
  const statusVersion = document.querySelector(".status-line b");
  if (statusVersion) statusVersion.textContent = `METROPOLIS v${METROPOLIS_PRODUCT_VERSION}`;
}

function metropolis41PolishLauncher() {
  if (typeof document === "undefined") return;
  document.querySelector(".metropolis-city-copy > p")?.remove();
  document.querySelectorAll(".metropolis-section-note").forEach(node => node.remove());
  document.querySelectorAll("[data-metropolis-app]").forEach(card => {
    const app = card.dataset.metropolisApp;
    const icon = metropolis41Icon(app);
    if (!icon) return;
    card.querySelectorAll(".metropolis-open-mark").forEach(node => node.remove());
    card.querySelectorAll(".metropolis-app-copy > small, .metropolis-app-status").forEach(node => node.remove());
    const target = card.querySelector(".metropolis-app-icon");
    if (target && target.dataset.metropolis41Applied !== "true") {
      target.innerHTML = icon;
      target.dataset.metropolis41Applied = "true";
    }
  });
  const page = document.body?.dataset.metropolisPage;
  const current = document.getElementById("metropolisCurrentIcon");
  const currentIcon = metropolis41Icon(page);
  if (current && currentIcon) current.innerHTML = currentIcon;
}

function metropolis41Apply() {
  metropolis41ApplyVersion();
  metropolis41PolishLauncher();
}

if (typeof module === "object" && module.exports) {
  module.exports = { METROPOLIS_PRODUCT_VERSION, METROPOLIS_R5_1_VERSION, metropolis41Icon };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let queued = false;
    const queueApply = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        metropolis41Apply();
      });
    };

    const install = () => {
      if (globalThis.__YGPH_METROPOLIS_41_RUNTIME__) return;
      globalThis.__YGPH_METROPOLIS_41_RUNTIME__ = true;
      if (globalThis.YGPHRuntime?.register) {
        globalThis.YGPHRuntime.register("METROPOLIS_R51", {
          afterRender: queueApply,
          afterPageChange: queueApply
        });
      }
      queueApply();
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  })();
}
