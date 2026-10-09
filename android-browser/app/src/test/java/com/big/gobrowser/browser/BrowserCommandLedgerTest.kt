package com.big.gobrowser.browser
import com.big.gobrowser.control.*
import org.junit.Assert.*
import org.junit.Test
class BrowserCommandLedgerTest {
    private val command=Command("id","GO","work","checkpoint","tab","device","capture",1,2,1000,2000,BrowserAction.CLICK,"browser.click",mapOf("targetId" to "target-0"))
    @Test fun repeatedPollingCannotDispatchOrReplaceAnAdmittedCommand() {
        val ledger=BrowserCommandLedger()
        assertNull(ledger.admit(command))
        repeat(3){assertEquals("DUPLICATE_COMMAND",ledger.admit(command.copy()))}
        assertEquals("COMMAND_ID_PAYLOAD_CHANGED",ledger.admit(command.copy(parameters=mapOf("targetId" to "target-1"))))
        assertNull(ledger.admit(command.copy(commandId="next")))
    }
    @Test fun capacityRejectsNewIdsWhileKeepingReplayIdentity() {
        val ledger=BrowserCommandLedger(1)
        assertNull(ledger.admit(command))
        assertEquals("COMMAND_LEDGER_FULL",ledger.admit(command.copy(commandId="next")))
        assertEquals("DUPLICATE_COMMAND",ledger.admit(command))
    }
}
