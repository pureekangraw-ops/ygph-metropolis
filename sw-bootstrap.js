"use strict";

(() => {
  function loadMetropolisR5() {
    if (!document.querySelector('link[data-metropolis-r5="true"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "metropolis-r5.css";
      link.dataset.metropolisR5 = "true";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-metropolis-r5="true"]')) {
      const script = document.createElement("script");
      script.src = "metropolis-r5.js";
      script.async = false;
      script.dataset.metropolisR5 = "true";
      document.head.appendChild(script);
    }
  }

  loadMetropolisR5();

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
