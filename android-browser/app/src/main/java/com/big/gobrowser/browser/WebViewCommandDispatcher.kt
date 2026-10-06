package com.big.gobrowser.browser

import android.webkit.WebView
import com.big.gobrowser.control.BrowserAction
import com.big.gobrowser.control.Command
import org.json.JSONTokener
import org.json.JSONObject

/** Native-initiated, allowlisted WebView actions. No arbitrary script is accepted. */
class WebViewCommandDispatcher(private val webView: WebView) {
    fun dispatch(command: Command, callback: (WebViewDispatchResult) -> Unit) {
        when (command.action) {
            BrowserAction.BACK -> { webView.goBack(); callback(WebViewDispatchResult(true, "BACK_DISPATCHED")); return }
            BrowserAction.FORWARD -> { webView.goForward(); callback(WebViewDispatchResult(true, "FORWARD_DISPATCHED")); return }
            BrowserAction.RELOAD -> { webView.reload(); callback(WebViewDispatchResult(true, "RELOAD_DISPATCHED")); return }
            BrowserAction.NAVIGATE, BrowserAction.OPEN -> {
                val url = command.parameters["url"].orEmpty()
                if (!BrowserSettings.isAllowedUrl(url)) { callback(WebViewDispatchResult(false, "HTTPS_URL_REQUIRED")); return }
                webView.loadUrl(url); callback(WebViewDispatchResult(true, "NAVIGATE_DISPATCHED")); return
            }
            BrowserAction.CLICK, BrowserAction.FILL, BrowserAction.SCROLL -> Unit
            BrowserAction.SELECT, BrowserAction.CLOSE -> {
                callback(WebViewDispatchResult(false, "ACTION_REQUIRES_TAB_STORE")); return
            }
        }
        val script = scriptFor(command)
        if (script == null) { callback(WebViewDispatchResult(false, "TARGET_REQUIRED")); return }
        webView.evaluateJavascript(script) { encoded ->
            val result = runCatching { JSONObject(JSONTokener(encoded).nextValue() as String) }
                .getOrNull()
            callback(WebViewDispatchResult(result?.optBoolean("ok", false) == true, result?.optString("reason") ?: "READBACK_UNAVAILABLE"))
        }
    }

    private fun scriptFor(command: Command): String {
        val target = JSONObject.quote(command.parameters["targetId"].orEmpty())
        val value = JSONObject.quote(command.parameters["value"].orEmpty())
        val amount = command.parameters["amount"]?.toIntOrNull() ?: 400
        val targetLookup = """
            (() => {
              const id = $target;
              const nodes = Array.from(document.querySelectorAll('a,button,[role],input,select,textarea,[tabindex]'));
              const el = id.startsWith('target-') ? nodes[Number(id.slice(7))] : document.getElementById(id);
              if (!el) return {ok:false,reason:'TARGET_NOT_FOUND'};
              const style = getComputedStyle(el), rect = el.getBoundingClientRect();
              if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return {ok:false,reason:'TARGET_NOT_VISIBLE'};
              return {ok:true,el:el};
            })()
        """.trimIndent()
        return when (command.action) {
            BrowserAction.CLICK -> """(() => { const r=$targetLookup; if(!r.ok)return r; r.el.click(); return {ok:true,reason:'CLICK_DISPATCHED'}; })()"""
            BrowserAction.FILL -> """(() => { const r=$targetLookup; if(!r.ok)return r; if((r.el.type||'').toLowerCase()==='password')return {ok:false,reason:'PASSWORD_TARGET_REJECTED'}; if(!['INPUT','TEXTAREA','SELECT'].includes(r.el.tagName))return {ok:false,reason:'NON_FORM_TARGET'}; r.el.value=$value; r.el.dispatchEvent(new Event('input',{bubbles:true})); r.el.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true,reason:'FILL_DISPATCHED'}; })()"""
            BrowserAction.SCROLL -> """(() => { window.scrollBy(0,$amount); return {ok:true,reason:'SCROLL_DISPATCHED'}; })()"""
            else -> """({ok:false,reason:'UNSUPPORTED_ACTION'})"""
        }
    }
}

data class WebViewDispatchResult(val accepted: Boolean, val reason: String)
