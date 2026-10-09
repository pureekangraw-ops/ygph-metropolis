package com.big.gobrowser.browser
import com.big.gobrowser.control.*
import org.junit.Assert.*
import org.junit.Test
class EpochReceiptQueueTest {
    private val receipt=Receipt("old",ReceiptStatus.ACCEPTED,"CLICK_DISPATCHED","before","after",1000,null,BusinessOutcome.UNKNOWN)
    @Test fun revokedDeliveryAndLateCallbackCannotPoisonNextSharingSession() {
        val queue=EpochReceiptQueue(1)
        assertTrue(queue.enqueue(0,receipt))
        val inFlight=queue.toList()
        queue.revoke(1)
        assertTrue(queue.toList().isEmpty())
        assertFalse(queue.enqueue(0,receipt))
        assertTrue(queue.enqueue(1,receipt.copy(commandId="new")))
        inFlight.forEach {queue.remove(it)}
        assertEquals("new",queue.toList().single().commandId)
    }
}
