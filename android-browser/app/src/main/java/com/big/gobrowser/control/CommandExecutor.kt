package com.big.gobrowser.control

interface ActionRunner {
    fun run(command: Command): String?
}

class CommandExecutor(
    private val runner: ActionRunner,
    private val now: () -> Long = { System.currentTimeMillis() }
) {
    private val completed = mutableSetOf<String>()

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
