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
    @Test fun removesCredentialsFromUrlAuthority() {
        assertEquals("https://example.com/a", sanitizeUrl("https://alice:password@example.com/a?token=secret#access_token=hidden"))
    }

    @Test fun exportedSnapshotRedactsTextAndEveryTargetCopy() {
        val target = Target("target-1", "token=roleSecret", "token=labelSecret", "link", 0, 0, 20, 20,
            href="https://example.com/a?token=hrefSecret", signature="a\u001fhttps://example.com/?token=signatureSecret")
        val sample = DomObserver("device", "test").capture("tab", "https://example.com", "token=titleSecret",
            "Authorization: Bearer bearerSecret\napi_key=bodySecret", listOf(target))
        val wire = com.big.gobrowser.transport.HttpRelayClient.snapshotJson(sample).toString()
        listOf("roleSecret", "labelSecret", "hrefSecret", "signatureSecret", "titleSecret", "bearerSecret", "bodySecret").forEach {
            assertTrue("Leaked $it", !wire.contains(it))
        }
        assertEquals("target-1", sample.targets.single().id)
        assertEquals("https://example.com/a", org.json.JSONObject(wire).getJSONArray("targets").getJSONObject(0).getString("href"))
        assertTrue(sample.targets.single().signature.contains("signatureSecret"))
    }
}

