package com.big.gobrowser.transport

import com.big.gobrowser.control.Command
import com.big.gobrowser.control.Receipt
import com.big.gobrowser.observer.Snapshot

/** Transport-only sync pass. It never executes browser commands. */
class SyncService(
    private val relay: RelayClient,
    private val outbox: Outbox
) {
    fun enqueue(snapshot: Snapshot): Boolean = outbox.enqueue(snapshot)

    fun syncOnce(): SyncReport {
        var published = 0
        var failed = 0
        var lastError: String? = null
        outbox.pending().forEach { snapshot ->
            runCatching {
                val ack = relay.publish(snapshot)
                require(ack.id == snapshot.captureId && ack.sequence == snapshot.sequence && ack.acceptedAtEpochMs > 0) { "Snapshot ACK mismatch" }
                outbox.ack(snapshot.captureId)
                published += 1
            }.onFailure {
                failed += 1
                lastError = it::class.simpleName ?: "PUBLISH_FAILED"
            }
        }
        val commands = runCatching { relay.pollCommands() }.getOrElse {
            lastError = it::class.simpleName ?: "POLL_FAILED"
            emptyList()
        }
        return SyncReport(published, failed, commands, outbox.droppedCount, lastError)
    }

    fun publishReceipt(receipt: Receipt): Ack = relay.publishReceipt(receipt).also {
        require(it.id == receipt.commandId && it.sequence == 0L && it.acceptedAtEpochMs > 0) { "Receipt ACK mismatch" }
    }
}

data class SyncReport(
    val published: Int,
    val failed: Int,
    val commands: List<Command>,
    val droppedCount: Long,
    val error: String? = null
)
