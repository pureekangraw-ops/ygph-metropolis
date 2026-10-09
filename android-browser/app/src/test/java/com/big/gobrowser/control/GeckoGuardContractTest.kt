package com.big.gobrowser.control

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class GeckoGuardContractTest {
    private val state = ControlState(true, true, "device", "tab", "capture", 4, 8, "frame-0")
    private fun command(frame: String = "frame-0") = Command("cmd-$frame", "GO", "work", "checkpoint", "tab", "device", "capture", 4, 8, 1000, 2000, BrowserAction.CLICK, "BROWSER_HAND", mapOf("frameId" to frame))
    @Test fun rejectsFrameMismatchBeforeExecution() {
        val result = CommandGuard.check(command("frame-2"), state, 1100)
        assertFalse(result.accepted); assertEquals(GuardReason.FRAME_MISMATCH, result.reason)
    }
    @Test fun acceptsExactFrameWithFreshCapture() {
        val result = CommandGuard.check(command(), state, 1100)
        assertEquals(GuardReason.ACCEPTED, result.reason)
    }
}
