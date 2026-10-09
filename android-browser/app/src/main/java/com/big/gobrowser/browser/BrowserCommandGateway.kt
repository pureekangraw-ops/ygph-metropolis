package com.big.gobrowser.browser

import com.big.gobrowser.control.Command
import com.big.gobrowser.control.CommandGuard
import com.big.gobrowser.control.ControlState
import com.big.gobrowser.control.Receipt
import com.big.gobrowser.control.ReceiptStatus
import com.big.gobrowser.control.BusinessOutcome

/** Foreground command boundary. It never treats a dispatched UI action as business success. */
class BrowserCommandGateway(
    private val tabStore: TabStore,
    private val now: () -> Long = { System.currentTimeMillis() }
) {
    private val completed = mutableSetOf<String>()

    fun execute(command: Command, state: ControlState, callback: (Receipt) -> Unit) {
        if (!completed.add(command.commandId)) {
            callback(Receipt(command.commandId, ReceiptStatus.UNKNOWN, "DUPLICATE_COMMAND", state.captureId, null, now(), null, BusinessOutcome.UNKNOWN))
            return
        }
        val guard = CommandGuard.check(command, state, now())
        if (!guard.accepted) {
            callback(Receipt(command.commandId, ReceiptStatus.REJECTED, guard.reason.name, state.captureId, null, now(), null, BusinessOutcome.UNKNOWN))
            return
        }
        val tab = tabStore.active()
        if (tab == null || tab.id != command.tabId) {
            callback(Receipt(command.commandId, ReceiptStatus.UNKNOWN, "ACTIVE_TAB_UNAVAILABLE", state.captureId, null, now(), null, BusinessOutcome.UNKNOWN))
            return
        }
        completed.add(command.commandId)
        WebViewCommandDispatcher(tab.webView).dispatch(command) { result ->
            callback(
                Receipt(
                    commandId = command.commandId,
                    status = if (result.accepted) ReceiptStatus.EXECUTED else ReceiptStatus.UNKNOWN,
                    reason = result.reason,
                    beforeCaptureId = state.captureId,
                    afterCaptureId = null,
                    executedAtEpochMs = now(),
                    readback = result.reason,
                    businessOutcome = BusinessOutcome.UNKNOWN
                )
            )
        }
    }
}
