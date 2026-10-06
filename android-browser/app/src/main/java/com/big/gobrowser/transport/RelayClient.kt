package com.big.gobrowser.transport

import com.big.gobrowser.control.Command
import com.big.gobrowser.control.Receipt
import com.big.gobrowser.observer.Snapshot

/** Transport boundary only. A live route must be supplied by the owner system before implementation. */
interface RelayClient {
    fun publish(snapshot: Snapshot): Ack
    fun pollCommands(): List<Command>
    fun publishReceipt(receipt: Receipt): Ack
}

data class Ack(val id: String, val sequence: Long, val acceptedAtEpochMs: Long)
