package com.big.gobrowser.browser;

import android.content.Context;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.WebExtension;
import java.util.ArrayList;
import java.util.List;

/** Observatory's native bridge to the PRISM-proven WebExtension observer pattern. */
public final class GeckoPageObserver {
  public interface Listener { void onObservation(GeckoSession session, JSONObject page); }
  private final Context context;
  private final Listener listener;
  private WebExtension extension;
  private final List<GeckoSession> pending = new ArrayList<>();
  GeckoPageObserver(Context context, Listener listener) { this.context = context.getApplicationContext(); this.listener = listener; }
  void install(GeckoRuntime runtime) {
    runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/observatory-observer/", "observatory-native-observer@yggmetro.com")
      .accept(extension -> { this.extension = extension; for (GeckoSession session : pending) bindInstalled(session); pending.clear(); }, error -> this.extension = null);
  }
  void bind(GeckoSession session) {
    if (extension == null) { if (!pending.contains(session)) pending.add(session); return; }
    bindInstalled(session);
  }
  private void bindInstalled(GeckoSession session) {
    WebExtension current = extension;
    if (current == null) return;
    session.getWebExtensionController().setMessageDelegate(current, new WebExtension.MessageDelegate() {
      @Override public GeckoResult<Object> onMessage(String nativeApp, Object message, WebExtension.MessageSender sender) {
        if (!"observatory_observer".equals(nativeApp) || !(message instanceof JSONObject) || sender.session != session) return null;
        JSONObject input = (JSONObject) message;
        if (!"OBSERVATION".equals(input.optString("type"))) return null;
        JSONObject page = input.optJSONObject("page");
        if (page == null || !page.optBoolean("capturesInputValues")) listener.onObservation(session, page);
        return null;
      }
    }, "observatory_observer");
  }
}
