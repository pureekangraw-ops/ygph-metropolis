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
        container.addView(webView, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.Layou…205 tokens truncated…activeId?.let(tabs::get)

    fun list(): List<BrowserTab> = tabs.values.toList()

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
