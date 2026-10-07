package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test

class LocationFixPolicyTest {
    @Test fun rejectsCachedOldFutureAndInvalidFixes() {
        assertTrue(LocationFixPolicy.accepts(100.5,13.75,50f,30_000))
        assertFalse(LocationFixPolicy.accepts(100.5,13.75,50f,30_001))
        assertFalse(LocationFixPolicy.accepts(100.5,13.75,50f,-1))
        assertFalse(LocationFixPolicy.accepts(Double.NaN,13.75,50f,0))
        assertFalse(LocationFixPolicy.accepts(181.0,13.75,50f,0))
        assertFalse(LocationFixPolicy.accepts(100.5,91.0,50f,0))
        assertFalse(LocationFixPolicy.accepts(100.5,13.75,Float.NaN,0))
        assertFalse(LocationFixPolicy.accepts(100.5,13.75,-1f,0))
    }
}
