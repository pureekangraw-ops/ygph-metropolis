package com.big.gobrowser.observer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DomObserverTest {
    @Test fun redactsQueryAndAdvancesRevisionOnlyOnChange() {
        val observer = DomObserver("device", "0.1.0") { 1000L }
        val first = observer.capture("tab", "https://example.com/a?token=secret", "A", "hello", emptyList())
        val second = observer.capture("tab", "https://example.com/a?token=other", "A", "hello", emptyList())
        assertEquals("https://example.com/a", first.url)
        assertEquals(first.revision, second.revision)
        assertEquals(2L, second.sequence)
    }

    @Test fun truncatesUtf8WithoutBrokenCharacters() {
        val (value, truncated) = truncateUtf8("ก".repeat(20), 10)
        assertTrue(truncated)
        assertTrue(value.toByteArray().size <= 10)
    }
}
