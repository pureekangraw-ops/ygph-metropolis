"use strict";

const METROPOLIS_PRODUCT_VERSION = "4.1.0";
const METROPOLIS_R5_1_VERSION = "5.1.0-minimal-launcher";

function metropolis41Icon(app) {
  return typeof flowIcon === "function" ? flowIcon(app) : "";
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
    card.querySelectorAll(".metropolis-app-status").forEach(node => node.remove());
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
