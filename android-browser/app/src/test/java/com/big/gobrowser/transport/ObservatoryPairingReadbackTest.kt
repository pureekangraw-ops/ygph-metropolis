package com.big.gobrowser.transport

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ObservatoryPairingReadbackTest {
    private val expected = MetropolisMcpClient.ObservatoryPair(
        deviceId = "device-1",
        workId = "work-1",
        publishSnapshot = "https://metropolis.example/device/device-1/snapshot",
    )

    @Test fun matchingDurableCredentialAndFieldsPass() {
        val result = ObservatoryPairingReadback.compare(
            expected, expected, CredentialSaveReadback(commitSucceeded = true, exactReadback = true), storageError = false,
        )
        assertTrue(result.passed)
        assertEquals("RD[C1 X1 P1 W1 D1 E1 S0]", result.safeSummary())
    }

    @Test fun missingLocalRecordFailsWithoutInventingFieldValues() {
        val result = ObservatoryPairingReadback.compare(
            expected, null, CredentialSaveReadback(commitSucceeded = true, exactReadback = true), storageError = false,
        )
        assertFalse(result.passed)
        assertEquals("RD[C1 X1 P0 W0 D0 E0 S0]", result.safeSummary())
    }

    @Test fun mismatchedWorkIsDistinguishedFromStorageFailure() {
        val wrongWork = expected.copy(workId = "different-work")
        val result = ObservatoryPairingReadback.compare(
            expected, wrongWork, CredentialSaveReadback(commitSucceeded = true, exactReadback = true), storageError = false,
        )
        assertFalse(result.passed)
        assertEquals("RD[C1 X1 P1 W0 D1 E1 S0]", result.safeSummary())
    }

    @Test fun storageExceptionIsVisibleOnlyAsSafeFlag() {
        val result = ObservatoryPairingReadback.compare(
            expected, null, CredentialSaveReadback(commitSucceeded = false, exactReadback = false), storageError = true,
        )
        assertFalse(result.passed)
        val summary = result.safeSummary()
        assertEquals("RD[C0 X0 P0 W0 D0 E0 S1]", summary)
        assertFalse(summary.contains("device-1"))
        assertFalse(summary.contains("work-1"))
        assertFalse(summary.contains("metropolis.example"))
    }
}
