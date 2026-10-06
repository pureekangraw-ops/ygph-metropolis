package com.big.gobrowser.transport

import com.big.gobrowser.control.Command
import com.big.gobrowser.control.Receipt
import com.big.gobrowser.observer.Snapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RelayClientTest {
    @Test fun relayRoutesMustBeHttps() {
        assertThrows(IllegalArgumentException::class.java) {
            RelayEndpoints("http://owner/publish", "https://owner/poll", "https://owner/receipt")
        }
    }

    @Test fun syncPublishesAndAcknowledgesOnlySuccessfulSnapshots() {
        val relay = FakeRelay()
        val outbox = Outbox(clock = { 1_000L })
        val sync = SyncService(relay, outbox)
        val snapshot = Snapshot("d", "t", "c", 1, 1, 1_000L, "0.1.0", url = "https://owner", title = "", text = "x", targets = emptyList(), truncated = false)
        assertEquals(true, sync.enqueue(snapshot))
        val report = sync.syncOnce()
        assertEquals(1, report.published)
        assertEquals(0, report.failed)
        assertEquals(1, relay.published)
        assertEquals(0, outbox.pending().size)
    }

    @Test fun mismatchedAckKeepsSnapshotPending() {
        val snapshot = Snapshot("d", "t", "c", 1, 7, 1_000L, "0.1.0", url = "https://owner", title = "", text = "x", targets = emptyList(), truncated = false)
        for (ack in listOf(Ack("other", 7, 1_000L), Ack("c", 6, 1_000L))) {
            val outbox = Outbox(clock = { 1_000L })
            val relay = object : RelayClient {
                override fun publish(snapshot: Snapshot) = ack
                override fun pollCommands(): List<Command> = emptyList()
                override fun publishReceipt(receipt: Receipt) = ack
            }
            val sync = SyncService(relay, outbox)
            sync.enqueue(snapshot)
            val report = sync.syncOnce()
            assertEquals(0, report.published)
            assertEquals(1, report.failed)
            assertEquals("c", outbox.pending().single().captureId)
        }
    }

    @Test fun wireAckRequiresAllMatchingFields() {
        for (raw in listOf("{}", "{\"id\":\"c\"}",
            "{\"id\":\"other\",\"sequence\":7,\"acceptedAtEpochMs\":1000}",
            "{\"id\":\"c\",\"sequence\":7.5,\"acceptedAtEpochMs\":1000}",
            "{\"id\":\"c\",\"sequence\":7,\"acceptedAtEpochMs\":0}")) {
            assertThrows(RelayProtocolException::class.java) { validateRelayAck(org.json.JSONObject(raw), "c", 7) }
        }
        assertEquals(Ack("c", 7, 1000), validateRelayAck(org.json.JSONObject("{\"id\":\"c\",\"sequence\":7,\"acceptedAtEpochMs\":1000}"), "c", 7))
    }

    private class FakeRelay : RelayClient {
        var published = 0
        override fun publish(snapshot: Snapshot): Ack { published += 1; return Ack(snapshot.captureId, snapshot.sequence, 1_000L) }
        override fun pollCommands(): List<Command> = emptyList()
        override fun publishReceipt(receipt: Receipt): Ack = Ack(receipt.commandId, 0L, 1_000L)
    }
}
