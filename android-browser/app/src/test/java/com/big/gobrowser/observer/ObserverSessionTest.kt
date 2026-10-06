package com.big.gobrowser.observer

import org.junit.Assert.*
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
    @Test fun switchingSharedTabsWithIdenticalContentCapturesNewTab() {
        val session = ObserverSession("d", "0.1.0") { 1_000L }
        session.start("a")
        assertNotNull(session.capture("a", "https://example.com", "", "same", emptyList()))
        session.start("b")
        assertNotNull(session.capture("b", "https://example.com", "", "same", emptyList()))
    }
    @Test fun stopRevokesFreshnessAndRestartCapturesIdenticalContent() {
        val session = ObserverSession("d", "0.1.0") { 1_000L }
        session.start("a")
        assertNotNull(session.capture("a", "https://example.com", "", "same", emptyList()))
        session.stop("a")
        assertEquals(FreshnessStatus.OFFLINE, session.status("a", true, 0))
        session.start("a")
        assertNotNull(session.capture("a", "https://example.com", "", "same", emptyList()))
        assertEquals(FreshnessStatus.OFFLINE, session.status("b", true, 0))
    }
}
