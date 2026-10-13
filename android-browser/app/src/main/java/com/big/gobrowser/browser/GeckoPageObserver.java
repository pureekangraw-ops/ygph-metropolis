package com.big.gobrowser.browser;

import android.content.Context;
import java.util.HashMap;
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
  private final Object lock = new Object();
  private WebExtension extension;
  private boolean installationFailed;
  private final Map<GeckoSession, Runnable> pending = new HashMap<>();
  private final Map<GeckoSession, WebExtension.Port> ports = new HashMap<>();
  private final Map<String, CommandCallback> callbacks = new HashMap<>();
  GeckoPageObserver(Context context, Listener listener) { this.context = context.getApplicationContext(); this.listener = listener; }
  void install(GeckoRuntime runtime) {
    runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/observatory-observer/", "observatory-native-observer@yggmetro.com")
      .accept(extension -> {
        Map<GeckoSession, Runnable> waiting;
        synchronized (lock) {
          this.extension = extension;
          waiting = new HashMap<>(pending);
          pending.clear();
        }
        android.util.Log.i("GeckoPageObserver", "Built-in observer installed");
        for (Map.Entry<GeckoSession, Runnable> entry : waiting.entrySet()) {
          bindInstalled(entry.getKey());
          entry.getValue().run();
        }
      }, error -> {
        Map<GeckoSession, Runnable> waiting;
        synchronized (lock) {
          installationFailed = true;
          waiting = new HashMap<>(pending);
          pending.clear();
        }
        android.util.Log.e("GeckoPageObserver", "Built-in observer installation failed", error);
        for (Runnable afterInstall : waiting.values()) afterInstall.run();
      });
  }
  void bind(GeckoSession session, Runnable afterInstall) {
    WebExtension installed;
    synchronized (lock) {
      installed = extension;
      if (installed == null && !installationFailed) {
        pending.put(session, afterInstall);
        return;
      }
    }
    if (installed != null) bindInstalled(session);
    afterInstall.run();
  }
  private void bindInstalled(GeckoSession session) {
    WebExtension current = extension; if (current == null) return;
    session.getWebExtensionController().setMessageDelegate(current, new WebExtension.MessageDelegate() {
      @Override public GeckoResult<Object> onMessage(String nativeApp, Object message, WebExtension.MessageSender sender) {
        if (!"observatory_observer".equals(nativeApp) || !(message instanceof JSONObject) || sender.session != session) return null;
        JSONObject input = (JSONObject) message;
        if (!"OBSERVATION".equals(input.optString("type"))) return null;
        JSONObject page = input.optJSONObject("page");
        if (page != null && !page.optBoolean("capturesInputValues")) {
          android.util.Log.d("GeckoPageObserver", "DOM observation received");
          listener.onObservation(session, page);
        }
        return null;
      }
      @Override public void onConnect(WebExtension.Port port) {
        if (port.sender == null || port.sender.session != session || !port.sender.isTopLevel()) return;
        android.util.Log.d("GeckoPageObserver", "Native observer port connected");
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
