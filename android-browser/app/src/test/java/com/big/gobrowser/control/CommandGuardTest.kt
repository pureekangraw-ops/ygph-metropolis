package com.big.gobrowser.control

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CommandGuardTest {
    private fun command(expires: Long = 20_000L, epoch: Long = 4L) = Command("c", "GO", "w", "cp", "tab", "device", "capture", 3, epoch, 0, expires, BrowserAction.CLICK, "browser.click")
    private val state = ControlState(true, true, "device", "tab", "capture", 3, 4)

    @Test fun acceptsFreshCommand() { assertTrue(CommandGuard.check(command(), state, 1_000).accepted) }
    @Test fun rejectsStaleTarget() { assertEquals(GuardReason.STALE_REVISION, CommandGuard.check(command(), state.copy(revision = 4), 1_000).reason) }
    @Test fun rejectsExpiredAndRevoked() {
        assertFalse(CommandGuard.check(command(expires = 500), state, 1_000).accepted)
        assertEquals(GuardReason.REVOKED_EPOCH, CommandGuard.check(command(epoch = 3), state, 1_000).reason)
    }
}
