"use strict";

(() => {
  const supported = "serviceWorker" in navigator
    && (location.protocol === "https:"
      || ["localhost", "127.0.0.1"].includes(location.hostname));
  if (!supported) return;

  const serviceWorker = navigator.serviceWorker;
  const hadController = Boolean(serviceWorker.controller);
  let reloading = false;

  if (hadController) {
    serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
})();
