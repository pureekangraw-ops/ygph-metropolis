package com.big.gobrowser.transport

import com.big.gobrowser.control.*
import org.junit.Assert.*
import org.junit.Test

class OwnerRelayConfigurationTest {
    private val config = OwnerRelayConfiguration(
        RelayEndpoints("https://owner/snapshots", "https://owner/commands", "https://owner/receipts"),
        "device", "work", "checkpoint", "GO", setOf("browser.click"))
    private val command = Command("id", "GO", "work", "checkpoint", "tab", "device", "capture", 1, 0,
        0, 30_000, BrowserAction.CLICK, "browser.click")
    @Test fun onlyExplicitOwnerWorkActorAndActionScopeIsAllowed() {
        assertTrue(config.allows(command))
        listOf(command.copy(actor = "LIGHT"), command.copy(workId = "other"),
            command.copy(checkpointId = "other"), command.copy(deviceId = "other"),
            command.copy(action = BrowserAction.FILL), command.copy(authority = "admin")).forEach {
            assertFalse(config.allows(it))
        }
    }
    @Test fun missingOwnerContractCannotSupplyDefaultRoutesOrGrants() {
        assertThrows(Exception::class.java) { OwnerRelayConfiguration.parse("{}") }
    }
}
