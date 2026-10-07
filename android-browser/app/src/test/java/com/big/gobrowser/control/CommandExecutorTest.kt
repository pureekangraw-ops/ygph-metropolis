package com.big.gobrowser.control

import org.junit.Assert.assertEquals
import org.junit.Test

class CommandExecutorTest {
    private val state = ControlState(true, true, "d", "t", "c", 1, 0)
    private val command = Command("id", "GO", "w", "cp", "t", "d", "c", 1, 0, 0, 30_000, BrowserAction.CLICK, "browser.click")

    @Test fun duplicateCommandIsNotDispatchedTwice() {
        var calls = 0
        val executor = CommandExecutor(ActionRunner { calls += 1; "dom-readback" }) { 1_000 }
        assertEquals(ReceiptStatus.EXECUTED, executor.execute(command, state).status)
        assertEquals(ReceiptStatus.UNKNOWN, executor.execute(command, state).status)
        assertEquals(1, calls)
    }
    @Test fun asynchronousDispatchWaitsForReadbackAndReservesCommandId() {
        var completion: ((ActionReadback) -> Unit)? = null
        val receipts = mutableListOf<Receipt>()
        val executor = CommandExecutor(ActionRunner { error("Synchronous runner must not be used") }) { 1_000 }
        executor.executeAsync(command, state, { _, done -> completion = done }, receipts::add)
        assertEquals(0, receipts.size)
        executor.executeAsync(command, state, { _, _ -> error("Duplicate dispatched") }, receipts::add)
        assertEquals("DUPLICATE_COMMAND", receipts.single().reason)
        completion!!(ActionReadback(true, "CLICK_DISPATCHED", "after", "DOM_CAPTURED"))
        completion!!(ActionReadback(true, "SECOND_CALLBACK"))
        assertEquals(2, receipts.size)
        assertEquals(ReceiptStatus.READBACK, receipts.last().status)
        assertEquals("after", receipts.last().afterCaptureId)
        assertEquals(BusinessOutcome.UNKNOWN, receipts.last().businessOutcome)
    }

    @Test fun asynchronousGuardRejectsRevokedEpochBeforeDispatch() {
        val executor = CommandExecutor(ActionRunner { null }) { 1_000 }
        var receipt: Receipt? = null
        executor.executeAsync(command, state.copy(epoch = 1), { _, _ -> error("Revoked command dispatched") }, { receipt = it })
        assertEquals(ReceiptStatus.REJECTED, receipt!!.status)
        assertEquals("REVOKED_EPOCH", receipt!!.reason)
    }
    @Test fun asyncExecutionTimestampPrecedesAfterCapture() {
        var time=1000L
        var finish:((ActionReadback)->Unit)?=null
        var result:Receipt?=null
        val executor=CommandExecutor(ActionRunner {null}) {time}
        executor.executeAsync(command,state,{_,done->finish=done},{result=it})
        time=1200L
        finish!!(ActionReadback(true,"CLICK_DISPATCHED","after","DOM_CAPTURED"))
        assertEquals(1000L,result!!.executedAtEpochMs)
    }
}
