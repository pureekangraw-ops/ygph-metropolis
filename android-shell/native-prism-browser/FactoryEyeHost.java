package com.yggdrasil.prism;

import org.mozilla.geckoview.GeckoRuntime;

public final class FactoryEyeHost {
  public static final String EXTENSION_ID = "ergasterion-factory-eye@pureekangraw.local";
  private static final String ASSET_URI = "resource://android/assets/factory-eye/";
  private FactoryEyeHost() {}
  public static void install(GeckoRuntime runtime, java.util.function.Consumer<String> status) {
    runtime.getWebExtensionController().ensureBuiltIn(ASSET_URI, EXTENSION_ID).accept(
      extension -> status.accept(extension != null ? "Factory Eye v0.4.0 · ready" : "Factory Eye · unavailable"),
      error -> status.accept("Factory Eye · " + (error == null ? "UNKNOWN" : error.getMessage()))
    );
  }
}
