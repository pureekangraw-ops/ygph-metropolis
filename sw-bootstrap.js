"use strict";

(() => {
  function loadStylesheet(href, marker) {
    if (typeof document === "undefined" || document.querySelector(`link[${marker}="true"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(marker, "true");
    document.head.appendChild(link);
  }

  function loadScript(src, marker) {
    if (typeof document === "undefined" || document.querySelector(`script[${marker}="true"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.setAttribute(marker, "true");
    document.head.appendChild(script);
  }

  function loadMetropolisLayers() {
    if (typeof document === "undefined") return;
    loadStylesheet("metropolis-r5.css", "data-metropolis-r5");
    loadScript("metropolis-r5.js", "data-metropolis-r5");
    loadStylesheet("metropolis-r5-1.css", "data-metropolis-r5-1");
    loadScript("metropolis-r5-1.js", "data-metropolis-r5-1");
    loadStylesheet("metropolis-r5-2.css", "data-metropolis-r5-2");
    loadScript("metropolis-r5-2.js", "data-metropolis-r5-2");
    loadStylesheet("metropolis-r5-3.css", "data-metropolis-r5-3");
    loadScript("metropolis-r5-3.js", "data-metropolis-r5-3");
    loadStylesheet("metropolis-r5-4.css", "data-metropolis-r5-4");
    loadScript("metropolis-r5-4.js", "data-metropolis-r5-4");
  }

  loadMetropolisLayers();

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
