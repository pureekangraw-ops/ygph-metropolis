package com.big.gobrowser.control

fun interface ActionRunner {
    fun run(command: Command): String?
}

class CommandExecutor(
    private val runner: ActionRunner,
    private val now: () -> Long = { System.currentTimeMillis() }
) {
    private val completed = mutableSetOf<String>()

    /** Reserve before dispatch; emit only after the asynchronous WebView callback. */
    fun executeAsync(command: Command, state: ControlState,
                     dispatch: (Command, (ActionReadback) -> Unit) -> Unit,
                     callback: (Receipt) -> Unit) {
        val dispatchedAt = now()
        fun receipt(status: ReceiptStatus, reason: String, result: ActionReadback? = null) =
            Receipt(command.commandId, status, reason, state.captureId, result?.captureId,
                dispatchedAt, result?.text, BusinessOutcome.UNKNOWN)
        if (command.commandId in completed) {
            callback(receipt(ReceiptStatus.UNKNOWN, "DUPLICATE_COMMAND")); return
        }
        val guard = CommandGuard.check(command, state, now())
        if (!guard.accepted) { callback(receipt(ReceiptStatus.REJECTED, guard.reason.name)); return }
        if (completed.size >= 1024) { callback(receipt(ReceiptStatus.REJECTED, "COMMAND_LEDGER_FULL")); return }
        completed += command.commandId
        var delivered = false
        val finish: (ActionReadback) -> Unit = { result ->
            if (!delivered) {
                delivered = true
                callback(receipt(if (result.accepted) ReceiptStatus.ACCEPTED else ReceiptStatus.REJECTED, result.reason, result))
            }
        }
        try { dispatch(command, finish) }
        catch (_: Exception) {
            if (!delivered) { delivered = true; callback(receipt(ReceiptStatus.UNKNOWN, "EXECUTION_UNCONFIRMED")) }
        }
    }

    fun execute(command: Command, state: ControlState): Receipt {
        if (completed.contains(command.commandId)) {
            return Receipt(command.commandId, ReceiptStatus.UNKNOWN, "DUPLICATE_COMMAND", null, null, now(), null, BusinessOutcome.UNKNOWN)
        }
        val guard = CommandGuard.check(command, state, now())
        if (!guard.accepted) {
            return Receipt(command.commandId, ReceiptStatus.REJECTED, guard.reason.name, state.captureId, null, now(), null, BusinessOutcome.UNKNOWN)
        }
        completed += command.commandId
        return runCatching { runner.run(command) }
            .fold(
                onSuccess = { readback -> Receipt(command.commandId, ReceiptStatus.EXECUTED, "ACTION_DISPATCHED", state.captureId, null, now(), readback, BusinessOutcome.UNKNOWN) },
                onFailure = { Receipt(command.commandId, ReceiptStatus.UNKNOWN, "EXECUTION_UNCONFIRMED", state.captureId, null, now(), null, BusinessOutcome.UNKNOWN) }
            )
    }
}

/** A dispatch/readback is evidence of browser action only, never business success. */
data class ActionReadback(val accepted: Boolean, val reason: String, val captureId: String? = null, val text: String? = null)
