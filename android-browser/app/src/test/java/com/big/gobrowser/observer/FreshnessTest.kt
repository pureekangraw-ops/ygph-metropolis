package com.big.gobrowser.observer

import org.junit.Assert.assertEquals
import org.junit.Test

class FreshnessTest {
    @Test fun ageBoundaries() {
        assertEquals(FreshnessStatus.LIVE, Freshness.resolve(true, 30_000, 1_000))
        assertEquals(FreshnessStatus.STALE, Freshness.resolve(true, 30_001, 1_000))
        assertEquals(FreshnessStatus.BACKGROUND, Freshness.resolve(false, 1, 1_000))
        assertEquals(FreshnessStatus.OFFLINE, Freshness.resolve(true, 1, 60_001))
    }
}
