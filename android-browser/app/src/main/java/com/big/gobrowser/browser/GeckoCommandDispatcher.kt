package com.big.gobrowser.browser

import android.content.Context
import com.big.gobrowser.control.BrowserAction
import com.big.gobrowser.control.Command
import org.json.JSONObject
import org.mozilla.geckoview.GeckoSession

/** Native guarded hand for a GeckoSession, using the WebExtension command port for DOM actions. */
class GeckoCommandDispatcher(private val observer: GeckoPageObserver, private val session: GeckoSession) {
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
        val payload = JSONObject().put("type", "EXECUTE").put("commandId", command.commandId)
            .put("action", command.action.name).put("captureId", command.captureId)
            .put("frameId", command.parameters["frameId"] ?: command.frameId)
            .put("targetId", command.parameters["targetId"] ?: "")
            .put("signature", command.parameters["signature"] ?: "")
            .put("parameters", JSONObject(command.parameters))
        observer.dispatch(session, payload) { accepted, reason -> callback(DispatchResult(accepted, reason)) }
    }
}

data class DispatchResult(val accepted: Boolean, val reason: String)
