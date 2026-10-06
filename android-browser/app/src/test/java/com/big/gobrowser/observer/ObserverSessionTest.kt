package com.big.gobrowser.observer

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ObserverSessionTest {
    @Test fun duplicateContentDoesNotCreateSnapshot() {
        var now = 1_000L
        val session = ObserverSession("d", "0.1.0") { now }
        session.start("tab")
        assertNotNull(session.capture("tab", "https://example.com", "", "same", emptyList()))
        now = 3_001L
        assertNull(session.capture("tab", "https://example.com", "", "same", emptyList()))
        assertNotNull(session.capture("tab", "https://example.com", "", "new", emptyList()))
        session.stop("tab")
        assertNull(session.capture("tab", "https://example.com", "", "new", emptyList()))
    }
}
