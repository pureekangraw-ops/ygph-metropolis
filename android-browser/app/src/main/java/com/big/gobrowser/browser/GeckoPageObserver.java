package com.big.gobrowser.browser;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
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
  private final Handler handler = new Handler(Looper.getMainLooper());
  private static final class Pending {
    final WebExtension.Port port; final CommandCallback callback; final Runnable timeout;
    Pending(WebExtension.Port port, CommandCallback callback, Runnable timeout) { this.port=port; this.callback=callback; this.timeout=timeout; }
  }
  private final Map<String, Pending> callbacks = new HashMap<>();
  private void complete(String id, WebExtension.Port source, boolean accepted, String reason) {
    Pending pending = callbacks.get(id);
    if (pending == null || pending.port != source) return;
    callbacks.remove(id); handler.removeCallbacks(pending.timeout); pending.callback.onResult(accepted, reason);
  }
  private void failPort(WebExtension.Port port) {
    for (String id : new ArrayList<>(callbacks.keySet())) complete(id, port, false, "OBSERVER_DISCONNECTED");
  }
  void dispose() {
    for (WebExtension.Port port : new ArrayList<>(ports.values())) failPort(port);
    ports.clear(); pending.clear();
  }
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
        WebExtension.Port previous = ports.put(session, port);
        if (previous != null) failPort(previous);
        port.setDelegate(new WebExtension.PortDelegate() {
          @Override public void onPortMessage(Object message, WebExtension.Port source) {
            if (!(message instanceof JSONObject)) return;
            JSONObject result = (JSONObject) message;
            if (result.has("ok")) complete(result.optString("commandId"), source, result.optBoolean("ok"), result.optString("reason", "READBACK_UNAVAILABLE"));
          }
          @Override public void onDisconnect(WebExtension.Port source) { if (ports.get(session) == source) ports.remove(session); failPort(source); }
        });
      }
    }, "observatory_observer");
  }
  void dispatch(GeckoSession session, JSONObject command, CommandCallback callback) {
    WebExtension.Port port = ports.get(session); if (port == null) { callback.onResult(false, "OBSERVER_PORT_UNAVAILABLE"); return; }
    String id = command.optString("commandId");
    if (id.isEmpty() || callbacks.containsKey(id)) { callback.onResult(false, "INVALID_COMMAND_ID"); return; }
    Runnable timeout = () -> complete(id, port, false, "COMMAND_TIMEOUT");
    callbacks.put(id, new Pending(port, callback, timeout));
    handler.postDelayed(timeout, 5000L);
    try { port.postMessage(command); } catch (Throwable error) { complete(id, port, false, "OBSERVER_PORT_UNAVAILABLE"); }
  }
}
