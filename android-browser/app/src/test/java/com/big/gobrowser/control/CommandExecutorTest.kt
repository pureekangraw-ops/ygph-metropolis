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
}
