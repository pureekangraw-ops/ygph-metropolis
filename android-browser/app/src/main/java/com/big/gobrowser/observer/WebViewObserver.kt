package com.big.gobrowser.observer

import android.content.Context
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONTokener
import org.json.JSONObject
import java.util.UUID

/**
 * Native-initiated DOM capture. The page cannot invoke this bridge and no arbitrary
 * JavaScript is accepted from transport callers.
 */
class WebViewObserver(context: Context, private val webView: WebView) {
    private val script: String = context.assets.open("observer.js").bufferedReader().use { it.readText() }

    fun capture(callback: (DomCapture?) -> Unit) {
        val captureToken = JSONObject.quote(UUID.randomUUID().toString())
        webView.evaluateJavascript("(function(){const captureToken=$captureToken;return $script;})()") { encoded ->
            callback(parse(encoded))
        }
    }

    fun bindCaptureId(captureId: String, callback: () -> Unit) {
        val id = JSONObject.quote(captureId)
        webView.evaluateJavascript("if(window.__goObserverTargets){window.__goObserverTargets.captureId=$id;}") { callback() }
    }

    private fun parse(encoded: String): DomCapture? = runCatching {
        val json = JSONTokener(encoded).nextValue() as String
        val objectJson = org.json.JSONObject(json)
        val targets = mutableListOf<Target>()
        val array: JSONArray = objectJson.optJSONArray("targets") ?: JSONArray()
        for (index in 0 until array.length()) {
            val target = array.getJSONObject(index)
            targets += Target(
                id = target.optString("id"),
                role = target.optString("role").ifBlank { null },
                label = target.optString("label").ifBlank { null },
                kind = target.optString("kind"),
                left = target.optInt("left"),
                top = target.optInt("top"),
                right = target.optInt("right"),
                bottom = target.optInt("bottom")
            )
        }
        DomCapture(
            captureId = objectJson.getString("captureId"),
            targetsChanged = objectJson.optBoolean("targetsChanged", true),
            url = objectJson.optString("url"),
            title = objectJson.optString("title"),
            text = objectJson.optString("text"),
            targets = targets
        )
    }.getOrNull()
}

data class DomCapture(
    val captureId: String,
    val targetsChanged: Boolean,
    val url: String,
    val title: String,
    val text: String,
    val targets: List<Target>
)
