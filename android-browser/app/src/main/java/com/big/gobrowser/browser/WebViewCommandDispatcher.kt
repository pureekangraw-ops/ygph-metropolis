package com.big.gobrowser.browser

import android.webkit.WebView
import com.big.gobrowser.control.BrowserAction
import com.big.gobrowser.control.Command
import org.json.JSONTokener
import org.json.JSONObject

/** Native-initiated, allowlisted actions against the exact captured DOM elements. */
class WebViewCommandDispatcher(private val webView: WebView) {
    private val script = webView.context.assets.open("command.js").bufferedReader().use { it.readText() }

    fun dispatch(command: Command, callback: (WebViewDispatchResult) -> Unit) {
        when (command.action) {
            BrowserAction.BACK -> { webView.goBack(); callback(WebViewDispatchResult(true, "BACK_DISPATCHED")); return }
            BrowserAction.FORWARD -> { webView.goForward(); callback(WebViewDispatchResult(true, "FORWARD_DISPATCHED")); return }
            BrowserAction.RELOAD -> { webView.reload(); callback(WebViewDispatchResult(true, "RELOAD_DISPATCHED")); return }
            BrowserAction.NAVIGATE, BrowserAction.OPEN -> {
                val url = command.parameters["url"].orEmpty()
                if (!BrowserSettings.isAllowedUrl(url)) { callback(WebViewDispatchResult(false, "HTTPS_URL_REQUIRED")); return }
                webView.loadUrl(url)
                callback(WebViewDispatchResult(true, "NAVIGATE_DISPATCHED")); return
            }
            BrowserAction.SELECT, BrowserAction.CLOSE -> {
                callback(WebViewDispatchResult(false, "ACTION_REQUIRES_TAB_STORE")); return
            }
            else -> Unit
        }
        val payload = JSONObject().apply {
            put("action", command.action.name)
            put("captureId", command.captureId)
            put("parameters", JSONObject(command.parameters))
        }
        webView.evaluateJavascript("(function(){const command=$payload;return JSON.stringify($script);})()") { encoded ->
            val result = runCatching { JSONObject(JSONTokener(encoded).nextValue() as String) }.getOrNull()
            callback(WebViewDispatchResult(result?.optBoolean("ok", false) == true, result?.optString("reason") ?: "READBACK_UNAVAILABLE"))
        }
    }
}

data class WebViewDispatchResult(val accepted: Boolean, val reason: String)
