package com.big.gobrowser.browser

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

class TabStore(
    context: Context,
    private val container: ViewGroup,
    private val onActiveUrlChanged: (String) -> Unit = {}
) {
    data class BrowserTab(
        val id: String,
        val webView: WebView,
        var requestedUrl: String
    )

    private val appContext = context.applicationContext
    private val webContext = context
    private val tabs = linkedMapOf<String, BrowserTab>()
    private var restoring=false
    private var activeId: String? = null
    private val preferences = appContext.getSharedPreferences("browser-session", Context.MODE_PRIVATE)

    fun open(url: String = BrowserSettings.START_URL): String = openWithId(url,UUID.randomUUID().toString())
    private fun openWithId(url:String,id:String):String {
        require(BrowserSettings.isAllowedUrl(url)) { "Only HTTPS URLs are allowed" }
        val webView = WebView(webContext)
        BrowserSettings.configure(webView)
        val tab = BrowserTab(id, webView,url)
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
        onActiveUrlChanged(tab.webView.url?:tab.requestedUrl)
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

    fun list(): List<BrowserTab> = tabs.values.toList()

    fun restore() {
        val savedActive=preferences.getString("active",null)
        val records=runCatching {JSONArray(preferences.getString("tabs","[]"))}.getOrElse {JSONArray()}
        val legacy=preferences.getStringSet("urls",emptySet()).orEmpty().toList()
        restoring=true
        try {
            for(i in 0 until records.length()) {
                val r=records.optJSONObject(i)?:continue
                val url=r.optString("url");val id=r.optString("id")
                if(BrowserSettings.isAllowedUrl(url)&&id.isNotBlank()&&!tabs.containsKey(id))openWithId(url,id)
            }
            if(tabs.isEmpty())legacy.filter(BrowserSettings::isAllowedUrl).forEach(::open)
            if(tabs.isEmpty())open()
            if(savedActive!=null && tabs.containsKey(savedActive))select(savedActive)
        } finally {restoring=false;persist()}
    }
    fun urlChanged() = persist()

    fun clearSession() {
        tabs.keys.toList().forEach(::close)
        preferences.edit().clear().apply()
    }

    private fun persist() {
        if(restoring)return
        val records=JSONArray()
        tabs.values.forEach {tab->
            val url=tab.webView.url?.takeIf(BrowserSettings::isAllowedUrl)?:tab.requestedUrl
            tab.requestedUrl=url
            records.put(JSONObject().put("id",tab.id).put("url",url))
        }
        preferences.edit().putString("tabs",records.toString()).putString("active",activeId).remove("urls").apply()
    }
}
