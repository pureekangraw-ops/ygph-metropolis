package com.big.gobrowser.control

enum class ReceiptStatus { RECEIVED, ACCEPTED, EXECUTED, READBACK, REJECTED, UNKNOWN }
enum class BusinessOutcome { VERIFIED, UNKNOWN }

data class Receipt(
    val commandId: String,
    val status: ReceiptStatus,
    val reason: String,
    val beforeCaptureId: String?,
    val afterCaptureId: String?,
    val executedAtEpochMs: Long,
    val readback: String?,
    val businessOutcome: BusinessOutcome
)
