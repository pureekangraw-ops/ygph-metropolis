package com.big.gobrowser.transport

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HubArrivalParserTest {
    @Test fun includesOnlyPresentObservatoryWorksWithReadAuthority() {
        val identity = JSONObject().put("structuredContent", JSONObject()
            .put("name", "GO")
            .put("nickname", "GO — Metropolis"))
        val works = JSONArray()
            .put(work("observatory-1", "OBSERVATORY", true, "read", "browser.observe"))
            .put(work("observatory-write-only", "OBSERVATORY", true, "browser.observe"))
            .put(work("absent", "OBSERVATORY", false, "read"))
            .put(work("other-owner", "METROPOLIS", true, "read"))
            .put(work("", "OBSERVATORY", true, "read"))
        val arrival = JSONObject().put("structuredContent", JSONObject().put("current", JSONObject()
            .put("sourceSha", "abc123")
            .put("observedAt", "2026-10-13T03:00:00Z")
            .put("works", works)))

        val parsed = HubArrivalParser.parse(identity, arrival)

        assertEquals("GO", parsed.actor)
        assertEquals("GO — Metropolis", parsed.nickname)
        assertEquals("abc123", parsed.sourceSha)
        assertEquals("2026-10-13T03:00:00Z", parsed.observedAt)
        assertEquals(1, parsed.observatoryWorks.size)
        assertEquals("observatory-1", parsed.observatoryWorks.single().workId)
        assertTrue(parsed.observatoryWorks.single().authorizedActions.contains("read"))
    }

    private fun work(id: String, owner: String, present: Boolean, vararg actions: String) =
        JSONObject()
            .put("workId", id)
            .put("ownerSystem", owner)
            .put("present", present)
            .put("authorizedActions", JSONArray().apply { actions.forEach { put(it) } })
}