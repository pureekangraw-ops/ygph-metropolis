package com.big.gobrowser.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RemoteSwipeScrollTest {
    @Test fun swipingUpScrollsDown() {
        assertEquals(260, RemoteSwipeScroll.delta(120f, 400f, 122f, 140f, 48f))
    }

    @Test fun swipingDownScrollsUp() {
        assertEquals(-300, RemoteSwipeScroll.delta(90f, 140f, 92f, 440f, 48f))
    }

    @Test fun tapsAndHorizontalSwipesNeverTriggerRemoteScroll() {
        assertNull(RemoteSwipeScroll.delta(100f, 100f, 103f, 109f, 48f))
        assertNull(RemoteSwipeScroll.delta(30f, 200f, 320f, 180f, 48f))
        assertNull(RemoteSwipeScroll.delta(100f, 100f, 110f, 147f, 48f))
    }

    @Test fun diagonalSwipesAndNonfiniteInputsAreRejected() {
        assertNull(RemoteSwipeScroll.delta(20f, 20f, 190f, 150f, 48f))
        assertNull(RemoteSwipeScroll.delta(Float.NaN, 20f, 20f, 100f, 48f))
    }

    @Test fun scrollDeltaIsBoundedToWorkerContract() {
        assertEquals(1800, RemoteSwipeScroll.delta(80f, 3000f, 80f, 100f, 48f))
        assertEquals(-1800, RemoteSwipeScroll.delta(80f, 100f, 80f, 3000f, 48f))
    }
}
