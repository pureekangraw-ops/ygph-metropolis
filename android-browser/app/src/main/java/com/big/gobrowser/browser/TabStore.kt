package com.big.gobrowser.browser

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import java.util.UUID

class TabStore(
    context: Context,
    private val container: ViewGroup,
    private val onActiveUrlChanged: (String) -> Unit = {}
) {
    data class BrowserTab(
        val id: String,
        val webView: WebView
    )

    private val appContext = context.applicationContext
    private val webContext = context
    private val tabs = linkedMapOf<String, BrowserTab>()
    private var activeId: String? = null
    private val preferences = appContext.getSharedPreferences("browser-session", Context.MODE_PRIVATE)

    fun open(url: String = BrowserSettings.START_URL): String {
        require(BrowserSettings.isAllowedUrl(url)) { "Only HTTPS URLs are allowed" }
        val webView = WebView(webContext)
        BrowserSettings.configure(webView)
        val tab = BrowserTab(UUID.randomUUID().toString(), webView)
        tabs[tab.id] = tab
        container.addView(webView, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        select(tab.id)
        webView.loadUrl(url)
        persist()
        return tab.id
    }

    fun select(id: String) {
        val tab = tabs[id] ?: return
        activeId = id
        tabs.forEach { (tabId, candidate) ->
            candidate.webView.visibility = if (tabId == id) View.VISIBLE else View.GONE
        }
        onActiveUrlChanged(tab.webView.url.orEmpty())
        persist()
    }

    fun close(id: String) {
        val tab = tabs.remove(id) ?: return
        container.removeView(tab.webView)
        tab.webView.stopLoading()
        tab.webView.destroy()
        if (activeId == id) {
            activeId = tabs.keys.lastOrNull()
            activeId?.let(::select)
        }
        persist()
    }

    fun active(): BrowserTab? = activeId?.let(tabs::get)

    fun restore() {
        val urls = preferences.getStringSet("urls", emptySet()).orEmpty().toList()
        if (urls.isEmpty()) {
            open()
            return
        }
        urls.filter(BrowserSettings::isAllowedUrl).forEach(::open)
        val savedActive = preferences.getString("active", null)
        if (savedActive != null && tabs.containsKey(savedActive)) select(savedActive)
    }

    fun clearSession() {
        tabs.keys.toList().forEach(::close)
        preferences.edit().clear().apply()
    }

    private fun persist() {
        val urls = tabs.values.mapNotNull { it.webView.url }.filter(BrowserSettings::isAllowedUrl).toSet()
        preferences.edit().putStringSet("urls", urls).putString("active", activeId).apply()
    }
}
