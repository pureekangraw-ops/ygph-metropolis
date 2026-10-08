package com.big.gobrowser.browser

import android.content.Context
import android.view.ViewGroup
import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.GeckoResult
import com.big.gobrowser.observer.Target

/** Engine-neutral browser surface backed by one process GeckoRuntime and one session per tab. */
class GeckoBrowserEngine(
    context: Context,
    private val container: ViewGroup,
    private val onUrlChanged: (String) -> Unit,
    private val onCapture: (GeckoTab, DomCapture) -> Unit,
    private val onNavigationIntercept: (GeckoTab, String) -> Boolean = { _, _ -> false }
) {
    data class GeckoTab(val id: String, val session: GeckoSession, var requestedUrl: String)
    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("observatory-gecko-tabs", Context.MODE_PRIVATE)
    private val recovery = GeckoBrowserRecovery(app)
    private val tabs = linkedMapOf<String, GeckoTab>()
    private var activeId: String? = null
    private var attached: GeckoView? = null
    private var observer: GeckoPageObserver
    private val runtime: GeckoRuntime

    init {
        runtime = RuntimeHolder.runtime(app)
        observer = GeckoPageObserver(app) { session, page ->
            val tab = tabs.values.firstOrNull { it.session === session } ?: return@GeckoPageObserver
            onCapture(tab, DomCapture.from(page))
        }
        observer.install(runtime)
    }

    fun runtime(): GeckoRuntime = runtime
    fun active(): GeckoTab? = activeId?.let(tabs::get)
    fun list(): List<GeckoTab> = tabs.values.toList()
    fun attach(view: GeckoView) { attached = view; active()?.let { view.setSession(it.session) }; updateVisibility(true) }
    fun detach() { attached?.releaseSession(); attached = null }
    fun open(url: String = BrowserSettings.START_URL, id: String? = null, state: GeckoSession.SessionState? = null): String {
        require(BrowserSettings.isAllowedUrl(url)) { "HTTPS_URL_REQUIRED" }
        val tabId = id ?: java.util.UUID.randomUUID().toString(); val session = GeckoSession(); val tab = GeckoTab(tabId, session, url)
        bind(tab); tabs[tabId] = tab; select(tabId); session.open(runtime)
        if (state != null) session.restoreState(state) else session.loadUri(url)
        persist(); return tabId
    }
    fun restore() {
        if (tabs.isNotEmpty()) return
        val records = runCatching { JSONArray(prefs.getString("tabs", "[]")) }.getOrDefault(JSONArray())
        for (i in 0 until records.length()) {
            val record = records.optJSONObject(i) ?: continue; val url = record.optString("url"); val id = record.optString("id")
            if (id.isNotBlank() && BrowserSettings.isAllowedUrl(url)) open(url, id, recovery.read(id))
        }
        if (tabs.isEmpty()) open()
        prefs.getString("active", null)?.takeIf(tabs::containsKey)?.let(::select)
    }
    fun select(id: String) { if (!tabs.containsKey(id)) return; updateVisibility(false); activeId = id; active()?.let { onUrlChanged(it.requestedUrl); attached?.let { view -> if (view.session !== it.session) { view.releaseSession(); view.setSession(it.session) } } }; updateVisibility(true); persist() }
    fun close(id: String) { val tab = tabs.remove(id) ?: return; val view = attached; if (view?.session === tab.session) { view.releaseSession(); attached = view }; recovery.remove(id); tab.session.close(); if (activeId == id) activeId = tabs.keys.lastOrNull(); if (tabs.isEmpty()) open() else { active()?.let { onUrlChanged(it.requestedUrl) }; attached?.let { attach(it) } }; persist() }
    fun navigate(url: String): Boolean { if (!BrowserSettings.isAllowedUrl(url)) return false; active()?.let { it.requestedUrl = url; it.session.loadUri(url); persist(); return true }; return false }
    fun back() { active()?.session?.goBack() }
    fun forward() { active()?.session?.goForward() }
    fun reload() { active()?.session?.reload() }
    fun dispatch(tab: GeckoTab, command: com.big.gobrowser.control.Command, callback: (DispatchResult) -> Unit) { GeckoCommandDispatcher(observer, tab.session).dispatch(command, callback) }
    fun updateVisibility(visible: Boolean) { tabs.values.forEach { tab -> val selected = visible && tab.id == activeId; runCatching { tab.session.setFocused(selected); tab.session.setActive(selected) } } }
    fun isOpen(tab: GeckoTab): Boolean = runCatching { tab.session.isOpen }.getOrDefault(false)
    private fun bind(tab: GeckoTab) {
        observer.bind(tab.session)
        tab.session.setContentDelegate(object : GeckoSession.ContentDelegate {
            override fun onCrash(session: GeckoSession) { recover(tab) }
            override fun onKill(session: GeckoSession) { recover(tab) }
        })
        tab.session.setProgressDelegate(object : GeckoSession.ProgressDelegate {
            override fun onPageStop(session: GeckoSession, success: Boolean) { if (tab.id == activeId) onUrlChanged(tab.requestedUrl) }
            override fun onSessionStateChange(session: GeckoSession, state: GeckoSession.SessionState) { recovery.write(tab.id, state); persist() }
        })
        tab.session.setNavigationDelegate(object : GeckoSession.NavigationDelegate {
            override fun onLoadRequest(session: GeckoSession, request: GeckoSession.NavigationDelegate.LoadRequest): GeckoResult<GeckoSession.NavigationDelegate.AllowOrDeny>? {
                // Intercept OAuth callback before Gecko navigates to the non-page endpoint.
                if (onNavigationIntercept(tab, request.uri)) return GeckoResult.fromValue(GeckoSession.NavigationDelegate.AllowOrDeny.DENY)
                return null
            }
            override fun onLocationChange(session: GeckoSession, url: String?, permissions: List<GeckoSession.PermissionDelegate.ContentPermission>, hasUserGesture: Boolean) {
                if (url != null) { tab.requestedUrl = url; if (tab.id == activeId) onUrlChanged(url); persist() }
            }
        })
    }
    private fun recover(tab: GeckoTab) { val state = recovery.read(tab.id); runCatching { if (attached?.session === tab.session) { attached?.releaseSession(); attached = null }; tab.session.open(runtime); if (state != null) tab.session.restoreState(state) else tab.session.loadUri(tab.requestedUrl); if (tab.id == activeId && attached == null) persist() } }
    private fun persist() { val records = JSONArray(); tabs.values.forEach { records.put(JSONObject().put("id", it.id).put("url", it.requestedUrl)) }; prefs.edit().putString("tabs", records.toString()).putString("active", activeId).apply() }
    private object RuntimeHolder { private var value: GeckoRuntime? = null; fun runtime(context: Context): GeckoRuntime = value ?: GeckoRuntime.create(context).also { value = it } }
}

data class DomCapture(val captureId: String, val frameId: String, val url: String, val title: String, val text: String, val targets: List<Target>) {
    companion object {
        fun from(page: JSONObject): DomCapture {
            val targets = mutableListOf<Target>(); val array = page.optJSONArray("targets") ?: JSONArray()
            for (i in 0 until array.length()) { val t = array.optJSONObject(i) ?: continue; targets += Target(t.optString("targetId"), t.optString("role").ifBlank { null }, t.optString("label").ifBlank { null }, t.optString("type"), t.optInt("left"), t.optInt("top"), t.optInt("right"), t.optInt("bottom"), t.optString("frameId", page.optString("frameId", "frame-0")), t.optString("tag"), t.optString("type"), t.optString("href").ifBlank { null }, t.optString("visibility", "visible"), t.optBoolean("disabled"), t.optString("signature")) }
            return DomCapture(page.optString("captureId"), page.optString("frameId", "frame-0"), page.optString("url"), page.optString("title"), page.optString("text"), targets)
        }
    }
}
