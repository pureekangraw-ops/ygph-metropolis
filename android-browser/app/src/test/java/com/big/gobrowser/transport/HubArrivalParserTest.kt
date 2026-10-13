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
            .put(work("observatory-1", "OBSERVATORY", true, "read", "browser.observe")
                .put("checkpointId", "checkpoint-1")
                .put("state", "HANDED_OFF")
                .put("updatedAt", "2026-10-12T01:07:21.065Z"))
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
        assertEquals("checkpoint-1", parsed.observatoryWorks.single().checkpointId)
        assertEquals("HANDED_OFF", parsed.observatoryWorks.single().state)
        assertEquals("2026-10-12T01:07:21.065Z", parsed.observatoryWorks.single().updatedAt)
        assertTrue(parsed.observatoryWorks.single().authorizedActions.contains("read"))
    }

    private fun work(id: String, owner: String, present: Boolean, vararg actions: String): JSONObject {
        val result = JSONObject()
            .put("workId", id)
            .put("ownerSystem", owner)
            .put("present", present)
            .put("authorizedActions", JSONArray().apply { actions.forEach { put(it) } })
        if (id.isBlank()) result.put("workId", JSONObject.NULL)
        return result
    }
}