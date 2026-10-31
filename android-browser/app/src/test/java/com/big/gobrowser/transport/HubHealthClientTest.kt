package com.big.gobrowser.transport

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HubHealthClientTest {
    @Test
    fun parsesOnlyThePublicHubHealthFields() {
        val parsed = HubHealthClient.parse(
            """{"service":"ygg-connection-hub-v2","version":"0.1.0","storageConfigured":true,"accessConfigured":false}""",
            "2026-10-31T00:00:00Z"
        )

        assertEquals("ygg-connection-hub-v2", parsed.service)
        assertEquals("0.1.0", parsed.version)
        assertTrue(parsed.storageConfigured)
        assertFalse(parsed.accessConfigured)
        assertEquals("2026-10-31T00:00:00Z", parsed.checkedAt)
        assertTrue(parsed.displayText().contains("not checked"))
        assertFalse(parsed.displayText().contains("Hub connected"))
    }

    @Test
    fun rejectsWrongServiceOrNonBooleanConfigFlags() {
        val wrongService = runCatching {
            HubHealthClient.parse(
                """{"service":"other","version":"0.1","storageConfigured":true,"accessConfigured":true}""",
                "now"
            )
        }.exceptionOrNull()
        assertEquals("HUB_HEALTH_INVALID", (wrongService as HubHealthFailure).safeCode)

        val stringFlag = runCatching {
            HubHealthClient.parse(
                """{"service":"ygg-connection-hub-v2","version":"0.1","storageConfigured":"true","accessConfigured":true}""",
                "now"
            )
        }.exceptionOrNull()
        assertEquals("HUB_HEALTH_INVALID", (stringFlag as HubHealthFailure).safeCode)
    }
}