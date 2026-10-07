package com.big.gobrowser.control

object CommandGuard {
    const val MAX_TTL_MS = 30_000L

    fun check(command: Command, state: ControlState, nowEpochMs: Long): GuardResult {
        if (command.expiresAtEpochMs < nowEpochMs) return GuardResult(false, GuardReason.EXPIRED)
        if (command.expiresAtEpochMs - command.issuedAtEpochMs > MAX_TTL_MS) return GuardResult(false, GuardReason.TOO_FAR_IN_FUTURE)
        if (!state.foreground || !state.interactive) return GuardResult(false, GuardReason.NOT_INTERACTIVE)
        if (command.deviceId != state.deviceId) return GuardResult(false, GuardReason.WRONG_DEVICE)
        if (command.tabId != state.tabId) return GuardResult(false, GuardReason.WRONG_TAB)
        if (command.captureId != state.captureId) return GuardResult(false, GuardReason.STALE_CAPTURE)
        if (command.revision != state.revision) return GuardResult(false, GuardReason.STALE_REVISION)
        if (command.epoch != state.epoch) return GuardResult(false, GuardReason.REVOKED_EPOCH)
        val frame = command.parameters["frameId"] ?: command.frameId
        if (frame != state.frameId) return GuardResult(false, GuardReason.FRAME_MISMATCH)
        if (command.authority.isBlank()) return GuardResult(false, GuardReason.AUTHORITY_REQUIRED)
        return GuardResult(true, GuardReason.ACCEPTED)
    }
}
