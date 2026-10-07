package com.big.gobrowser.browser;

import android.content.Context;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.WebExtension;

/** Observatory's native bridge to the PRISM-proven WebExtension observer and command port. */
public final class GeckoPageObserver {
  public interface Listener { void onObservation(GeckoSession session, JSONObject page); }
  public interface CommandCallback { void onResult(boolean accepted, String reason); }
  private final Context context; private final Listener listener;
  private WebExtension extension;
  private final List<GeckoSession> pending = new ArrayList<>();
  private final Map<GeckoSession, WebExtension.Port> ports = new HashMap<>();
  private final Map<String, CommandCallback> callbacks = new HashMap<>();
  GeckoPageObserver(Context context, Listener listener) { this.context = context.getApplicationContext(); this.listener = listener; }
  void install(GeckoRuntime runtime) {
    runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/observatory-observer/", "observatory-native-observer@yggmetro.com")
      .accept(extension -> { this.extension = extension; for (GeckoSession session : pending) bindInstalled(session); pending.clear(); }, error -> this.extension = null);
  }
  void bind(GeckoSession session) { if (extension == null) { if (!pending.contains(session)) pending.add(session); return; } bindInstalled(session); }
  private void bindInstalled(GeckoSession session) {
    WebExtension current = extension; if (current == null) return;
    session.getWebExtensionController().setMessageDelegate(current, new WebExtension.MessageDelegate() {
      @Override public GeckoResult<Object> onMessage(String nativeApp, Object message, WebExtension.MessageSender sender) {
        if (!"observatory_observer".equals(nativeApp) || !(message instanceof JSONObject) || sender.session != session) return null;
        JSONObject input = (JSONObject) message;
        if (!"OBSERVATION".equals(input.optString("type"))) return null;
        JSONObject page = input.optJSONObject("page");
        if (page != null && !page.optBoolean("capturesInputValues")) listener.onObservation(session, page);
        return null;
      }
      @Override public void onConnect(WebExtension.Port port) {
        if (port.sender == null || port.sender.session != session || !port.sender.isTopLevel()) return;
        ports.put(session, port);
        port.setDelegate(new WebExtension.PortDelegate() {
          @Override public void onPortMessage(Object message, WebExtension.Port source) {
            if (!(message instanceof JSONObject)) return;
            JSONObject result = (JSONObject) message; String id = result.optString("commandId"); CommandCallback callback = callbacks.remove(id);
            if (callback != null) callback.onResult(result.optBoolean("ok"), result.optString("reason", "READBACK_UNAVAILABLE"));
          }
          @Override public void onDisconnect(WebExtension.Port source) { if (ports.get(session) == source) ports.remove(session); }
        });
      }
    }, "observatory_observer");
  }
  void dispatch(GeckoSession session, JSONObject command, CommandCallback callback) {
    WebExtension.Port port = ports.get(session); if (port == null) { callback.onResult(false, "OBSERVER_PORT_UNAVAILABLE"); return; }
    String id = command.optString("commandId"); callbacks.put(id, callback);
    try { port.postMessage(command); } catch (Throwable error) { callbacks.remove(id); callback.onResult(false, "OBSERVER_PORT_UNAVAILABLE"); }
  }
}
