"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const DEFAULT_ROOT = path.resolve(__dirname, "../..");

function readRuntimeOrder(root = DEFAULT_ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "RELEASE_MANIFEST.json"), "utf8"));
  return manifest.runtimeOrder.filter(file => file.endsWith(".js"));
}

function htmlWithoutProductionScripts(root) {
  return fs.readFileSync(path.join(root, "index.html"), "utf8")
    .replace(/\s*<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/gi, "");
}

function messageOf(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value && typeof value === "object" && "message" in value) return String(value.message);
  return String(value);
}

function createRuntime({
  root = DEFAULT_ROOT,
  scripts = [],
  url = "https://metropolis.test/index.html",
  beforeScripts = null,
  dispatchDomContentLoaded = false
} = {}) {
  const dom = new JSDOM(htmlWithoutProductionScripts(root), {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  const context = dom.getInternalVMContext();
  const capturedErrors = [];
  const scriptErrors = [];
  const evaluatedScripts = [];
  const appendedScripts = [];
  const animationFrames = [];
  const timers = [];
  let nextHandle = 1;

  const capture = (kind, value, source = null) => {
    const entry = {
      kind,
      source,
      name: value?.name || null,
      message: messageOf(value)
    };
    capturedErrors.push(entry);
    return entry;
  };

  window.addEventListener("error", event => capture("window.error", event.error || event.message, event.filename || null));
  window.addEventListener("unhandledrejection", event => capture("unhandledrejection", event.reason));
  window.console.error = (...args) => capture("console.error", args.map(messageOf).join(" "));
  window.console.warn = () => {};
  window.requestAnimationFrame = callback => {
    const handle = nextHandle++;
    animationFrames.push({ handle, callback });
    return handle;
  };
  window.cancelAnimationFrame = handle => {
    const index = animationFrames.findIndex(item => item.handle === handle);
    if (index >= 0) animationFrames.splice(index, 1);
  };
  window.setTimeout = callback => {
    const handle = nextHandle++;
    timers.push({ handle, callback });
    return handle;
  };
  window.clearTimeout = handle => {
    const index = timers.findIndex(item => item.handle === handle);
    if (index >= 0) timers.splice(index, 1);
  };
  window.setInterval = () => nextHandle++;
  window.clearInterval = () => {};
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.URL.createObjectURL = () => "blob:metropolis-runtime-test";
  window.URL.revokeObjectURL = () => {};
  window.TextEncoder ||= global.TextEncoder;
  window.TextDecoder ||= global.TextDecoder;
  window.structuredClone ||= global.structuredClone;
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  Object.defineProperty(window.navigator, "storage", {
    configurable: true,
    value: {
      estimate: async () => ({ usage: 0, quota: 100_000_000 }),
      persist: async () => true
    }
  });

  const originalAppendChild = window.document.head.appendChild.bind(window.document.head);
  window.document.head.appendChild = node => {
    if (node?.tagName === "SCRIPT" && node.getAttribute("src")) appendedScripts.push(node.getAttribute("src"));
    return originalAppendChild(node);
  };

  function evaluate(source, filename = "runtime-inline.js") {
    return new vm.Script(`${source}\n//# sourceURL=${filename}`, { filename }).runInContext(context);
  }

  function evaluateFile(file) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    try {
      const result = evaluate(source, file);
      evaluatedScripts.push(file);
      return result;
    } catch (error) {
      scriptErrors.push(capture("script", error, file));
      return undefined;
    }
  }

  async function flushRuntime({ limit = 200 } = {}) {
    let callbacks = 0;
    for (let pass = 0; pass < limit; pass += 1) {
      await Promise.resolve();
      const frames = animationFrames.splice(0);
      const queuedTimers = timers.splice(0);
      if (!frames.length && !queuedTimers.length) {
        await Promise.resolve();
        if (!animationFrames.length && !timers.length) return callbacks;
        continue;
      }
      for (const { callback } of [...frames, ...queuedTimers]) {
        callbacks += 1;
        try {
          if (typeof callback === "function") callback(Date.now());
          else evaluate(String(callback), "scheduled-runtime.js");
        } catch (error) {
          capture("scheduled", error);
        }
      }
    }
    throw new Error(`Runtime callbacks did not settle within ${limit} passes`);
  }

  if (typeof beforeScripts === "function") beforeScripts({ window, context, evaluate });
  scripts.forEach(evaluateFile);
  if (dispatchDomContentLoaded) {
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  }

  return {
    root,
    dom,
    window,
    context,
    capturedErrors,
    scriptErrors,
    evaluatedScripts,
    appendedScripts,
    evaluate,
    evaluateFile,
    flushRuntime,
    close: () => dom.window.close()
  };
}

function loadProductionRuntime(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  return createRuntime({
    ...options,
    root,
    scripts: options.scripts || readRuntimeOrder(root),
    dispatchDomContentLoaded: options.dispatchDomContentLoaded ?? true
  });
}

module.exports = {
  DEFAULT_ROOT,
  readRuntimeOrder,
  createRuntime,
  loadProductionRuntime
};
