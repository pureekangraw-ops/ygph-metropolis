package com.big.gobrowser.browser;

import android.content.Context;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import org.json.JSONArray;
import android.os.Handler;
import android.os.Looper;
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
  private final Map<GeckoSession, GeckoFrameLedger<JSONObject, WebExtension.Port>> frames = new HashMap<>();
  private final Handler handler = new Handler(Looper.getMainLooper());
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
        if (page != null && !page.optBoolean("capturesInputValues")) {
          GeckoFrameLedger<JSONObject, WebExtension.Port> ledger = frames.get(session);
          String frameId = page.optString("frameId");
          GeckoFrameLedger.Frame<JSONObject, WebExtension.Port> frame = ledger == null ? null : ledger.route(ledger.captureId(), frameId);
          if (frame != null && frame.documentId.equals(page.optString("documentId")) && sender.url.equals(page.optString("url"))) {
            ledger.observe(frameId, frame.documentId, page.optString("captureId"), page, frame.port, sender.isTopLevel());
            publish(session, ledger);
          }
        }
        return null;
      }
      @Override public void onConnect(WebExtension.Port port) {
        if (port.sender == null || port.sender.session != session) return;
        GeckoFrameLedger<JSONObject, WebExtension.Port> ledger = frames.computeIfAbsent(session, key -> new GeckoFrameLedger<>());
        port.setDelegate(new WebExtension.PortDelegate() {
          @Override public void onPortMessage(Object message, WebExtension.Port source) {
            if (!(message instanceof JSONObject)) return;
            JSONObject result = (JSONObject) message;
            if ("FRAME_READY".equals(result.optString("type"))) {
              String frameId = result.optString("frameId");
              // Bind identity to Gecko's sender before accepting the page's observations.
              JSONObject pendingPage = new JSONObject();
              ledger.observe(frameId, result.optString("documentId"), "pending", pendingPage, source, port.sender.isTopLevel());
              return;
            }
            String id = result.optString("commandId");
            String key = System.identityHashCode(source) + ":" + id;
            CommandCallback callback = callbacks.remove(key);
            if (callback != null) callback.onResult(result.optBoolean("ok"), result.optString("reason", "READBACK_UNAVAILABLE"));
          }
          @Override public void onDisconnect(WebExtension.Port source) { ledger.disconnect(source); publish(session, ledger); }
        });
      }
    }, "observatory_observer");
  }
  private void publish(GeckoSession session, GeckoFrameLedger<JSONObject, WebExtension.Port> ledger) {
    GeckoFrameLedger.Frame<JSONObject, WebExtension.Port> top = ledger.top();
    if (top == null || !top.page.has("url")) return;
    try {
      JSONObject page = new JSONObject(top.page.toString()); JSONArray targets = new JSONArray();
      StringBuilder text = new StringBuilder(top.page.optString("text"));
      for (GeckoFrameLedger.Frame<JSONObject, WebExtension.Port> frame : ledger.frames()) {
        JSONArray input = frame.page.optJSONArray("targets");
        if (input != null) for (int i=0; i<input.length() && targets.length()<500; i++) targets.put(input.get(i));
        if (!"frame-0".equals(frame.id)) text.append("\n").append(frame.page.optString("text"));
      }
      page.put("captureId", ledger.captureId()).put("targets", targets).put("text", text.substring(0, Math.min(text.length(), 200000)));
      listener.onObservation(session, page);
    } catch (Exception ignored) { /* malformed frame observations never become evidence */ }
  }
  void dispatch(GeckoSession session, JSONObject command, CommandCallback callback) {
    GeckoFrameLedger<JSONObject, WebExtension.Port> ledger = frames.get(session);
    String frameId = command.optString("frameId", "frame-0");
    GeckoFrameLedger.Frame<JSONObject, WebExtension.Port> frame = ledger == null ? null : ledger.route(command.optString("captureId"), frameId);
    if (frame == null || !frame.page.has("url")) { callback.onResult(false, "STALE_FRAME_CAPTURE"); return; }
    WebExtension.Port port = frame.port;
    String key = System.identityHashCode(port) + ":" + command.optString("commandId"); callbacks.put(key, callback);
    try {
      JSONObject local = new JSONObject(command.toString()).put("captureId", frame.captureId);
      port.postMessage(local);
      handler.postDelayed(() -> { CommandCallback pending = callbacks.remove(key); if (pending != null) pending.onResult(false, "EXECUTION_UNCONFIRMED"); }, 5000);
    } catch (Throwable error) { callbacks.remove(key); callback.onResult(false, "EXECUTION_UNCONFIRMED"); }
  }
}
