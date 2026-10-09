package com.big.gobrowser.transport

import com.big.gobrowser.observer.DomObserver
import org.junit.Assert.assertEquals
import org.junit.Test

class OutboxTest {
    @Test fun stopShareClearsPendingTab() {
        val snapshot = DomObserver("d", "0.1.0") { 1L }.capture("tab", "https://example.com", "", "text", emptyList())
        val outbox = Outbox()
        outbox.enqueue(snapshot)
        outbox.clearTab("tab")
        assertEquals(0, outbox.pending().size)
    }

    @Test fun oldSequenceDoesNotReplaceNewerCapture() {
        val observer = DomObserver("d", "0.1.0") { 1L }
        val first = observer.capture("tab", "https://example.com", "", "a", emptyList())
        val second = observer.capture("tab", "https://example.com", "", "b", emptyList())
        val outbox = Outbox(clock = { 1_000L })
        outbox.enqueue(first); outbox.enqueue(second); outbox.ack(first.captureId)
        assertEquals(second.captureId, outbox.pending().single().captureId)
    }
    @Test fun targetMetadataCountsTowardTheMemoryLimit() {
        val target = com.big.gobrowser.observer.Target("target-0", "button", "x".repeat(1000), "button", 0, 0, 10, 10)
        val snapshot = DomObserver("d", "v") { 1000L }.capture("tab", "https://owner", "", "", listOf(target))
        val outbox = Outbox(maxBytes = 2000, clock = { 1000L })
        assertEquals(false, outbox.enqueue(snapshot))
        assertEquals(0, outbox.pending().size)
        assertEquals(1L, outbox.droppedCount)
    }
}
