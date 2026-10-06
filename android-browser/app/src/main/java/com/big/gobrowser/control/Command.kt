package com.big.gobrowser.control

enum class BrowserAction { NAVIGATE, OPEN, SELECT, CLOSE, BACK, FORWARD, RELOAD, SCROLL, CLICK, FILL }

data class Command(
    val commandId: String,
    val actor: String,
    val workId: String,
    val checkpointId: String,
    val tabId: String,
    val deviceId: String,
    val captureId: String,
    val revision: Long,
    val epoch: Long,
    val issuedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val action: BrowserAction,
    val authority: String
)

data class ControlState(
    val foreground: Boolean,
    val interactive: Boolean,
    val deviceId: String,
    val tabId: String,
    val captureId: String,
    val revision: Long,
    val epoch: Long
)

enum class GuardReason { ACCEPTED, EXPIRED, TOO_FAR_IN_FUTURE, NOT_INTERACTIVE, WRONG_DEVICE, WRONG_TAB, STALE_CAPTURE, STALE_REVISION, REVOKED_EPOCH, AUTHORITY_REQUIRED }
data class GuardResult(val accepted: Boolean, val reason: GuardReason)
