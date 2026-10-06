package com.big.gobrowser.observer

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ObserverSessionTest {
    @Test fun duplicateContentDoesNotCreateSnapshot() {
        val session = ObserverSession("d", "0.1.0") { 1_000L }
        session.start("tab")
        assertNotNull(session.capture("tab", "https://example.com", "", "same", emptyList()))
        assertNull(session.capture("tab", "https://example.com", "", "same", emptyList()))
        session.stop("tab")
        assertNull(session.capture("tab", "https://example.com", "", "new", emptyList()))
    }
}
