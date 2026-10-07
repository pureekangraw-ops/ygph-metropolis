package com.big.gobrowser.browser

import android.content.Context
import com.big.gobrowser.control.BrowserAction
import com.big.gobrowser.control.Command
import org.json.JSONObject
import org.mozilla.geckoview.GeckoSession

/** Native guarded hand for a GeckoSession. DOM commands run only after capture checks in content JS. */
class GeckoCommandDispatcher(private val context: Context, private val session: GeckoSession) {
    private val script = context.assets.open("command.js").bufferedReader().use { it.readText() }
    fun dispatch(command: Command, callback: (DispatchResult) -> Unit) {
        when (command.action) {
            BrowserAction.BACK -> { session.goBack(); callback(DispatchResult(true, "BACK_DISPATCHED")); return }
            BrowserAction.FORWARD -> { session.goForward(); callback(DispatchResult(true, "FORWARD_DISPATCHED")); return }
            BrowserAction.RELOAD -> { session.reload(); callback(DispatchResult(true, "RELOAD_DISPATCHED")); return }
            BrowserAction.NAVIGATE, BrowserAction.OPEN -> {
                val url = command.parameters["url"].orEmpty()
                if (!BrowserSettings.isAllowedUrl(url)) { callback(DispatchResult(false, "HTTPS_URL_REQUIRED")); return }
                session.loadUri(url); callback(DispatchResult(true, "NAVIGATE_DISPATCHED")); return
            }
            BrowserAction.SELECT, BrowserAction.CLOSE -> { callback(DispatchResult(false, "ACTION_REQUIRES_TAB_STORE")); return }
            else -> Unit
        }
        val payload = JSONObject().put("action", command.action.name).put("captureId", command.captureId)
            .put("frameId", command.parameters["frameId"] ?: "frame-0")
            .put("targetId", command.parameters["targetId"] ?: "")
            .put("signature", command.parameters["signature"] ?: "")
            .put("parameters", JSONObject(command.parameters))
        val expression = "(function(){const command=${payload};return JSON.stringify((function(){${script}\n})());})()"
        try {
            session.evaluateJS(expression).accept({ value ->
                val result = runCatching {
                    val raw = value?.toString()?.trim('"')?.replace("\\\"", "\"") ?: "{}"
                    JSONObject(raw)
                }.getOrNull()
                callback(DispatchResult(result?.optBoolean("ok", false) == true, result?.optString("reason", "READBACK_UNAVAILABLE") ?: "READBACK_UNAVAILABLE"))
            }, { callback(DispatchResult(false, "READBACK_UNAVAILABLE")) })
        } catch (_: Throwable) { callback(DispatchResult(false, "EXECUTION_UNCONFIRMED")) }
    }
}

data class DispatchResult(val accepted: Boolean, val reason: String)
