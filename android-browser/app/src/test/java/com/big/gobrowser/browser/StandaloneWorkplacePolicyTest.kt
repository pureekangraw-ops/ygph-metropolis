package com.big.gobrowser.browser

import org.junit.Assert.*
import org.junit.Test

class StandaloneWorkplacePolicyTest {
    @Test fun onlyTheConfiguredHttpsOriginIsAllowed() {
        assertTrue(StandaloneWorkplacePolicy.allowsUrl(StandaloneWorkplacePolicy.URL))
        assertTrue(StandaloneWorkplacePolicy.allowsUrl(
            "https://${StandaloneWorkplacePolicy.HOST}/?view=tasks"
        ))
        assertFalse(StandaloneWorkplacePolicy.allowsUrl("http://${StandaloneWorkplacePolicy.HOST}/"))
        assertFalse(StandaloneWorkplacePolicy.allowsUrl("https://evil.example/"))
        assertFalse(StandaloneWorkplacePolicy.allowsUrl(
            "https://${StandaloneWorkplacePolicy.HOST}.evil.example/"
        ))
        assertFalse(StandaloneWorkplacePolicy.allowsUrl(
            "https://user@${StandaloneWorkplacePolicy.HOST}/"
        ))
        assertFalse(StandaloneWorkplacePolicy.allowsUrl(
            "https://${StandaloneWorkplacePolicy.HOST}:444/"
        ))
    }

    @Test fun exportedJsonMustBeValidAndWithinTheSizeLimit() {
        assertTrue(StandaloneWorkplacePolicy.isJsonObjectWithinLimit(
            """{"format":"UW_HANDOFF","version":1}"""
        ))
        assertTrue(StandaloneWorkplacePolicy.isJsonObjectWithinLimit("""[{"taskId":"x"}]"""))
        assertFalse(StandaloneWorkplacePolicy.isJsonObjectWithinLimit("not-json"))
        assertFalse(StandaloneWorkplacePolicy.isJsonObjectWithinLimit("""{"ok":true} trailing"""))
        assertFalse(StandaloneWorkplacePolicy.isJsonObjectWithinLimit(null))
        assertFalse(StandaloneWorkplacePolicy.isJsonObjectWithinLimit(
            "\"${"x".repeat(StandaloneWorkplacePolicy.MAX_JSON_BYTES)}\""
        ))
    }

    @Test fun filenamesCannotEscapeTheDocumentPickerNameOrMimeType() {
        assertEquals("UW-HANDOFF-go.json",
            StandaloneWorkplacePolicy.safeFilename("../UW-HANDOFF-go.json", "application/json"))
        assertEquals("artwork.svg",
            StandaloneWorkplacePolicy.safeFilename("../artwork.json", "image/svg+xml"))
        assertEquals("preview.png",
            StandaloneWorkplacePolicy.safeFilename("preview", "image/png"))
        assertEquals("workplace-export.json",
            StandaloneWorkplacePolicy.safeFilename(null, "application/json"))
    }

    @Test fun svgAndPngExportsAreConstrained() {
        assertTrue(StandaloneWorkplacePolicy.isSafeSvgWithinLimit(
            """<svg xmlns="http://www.w3.org/2000/svg"><text>Safe</text></svg>"""
        ))
        assertFalse(StandaloneWorkplacePolicy.isSafeSvgWithinLimit(
            """<svg onload="alert(1)"></svg>"""
        ))
        assertFalse(StandaloneWorkplacePolicy.isSafeSvgWithinLimit(
            """<svg><script>alert(1)</script></svg>"""
        ))
        assertFalse(StandaloneWorkplacePolicy.isSafeSvgWithinLimit(
            """<svg><image href="https://example.com/image.png"/></svg>"""
        ))
        assertFalse(StandaloneWorkplacePolicy.isSafeSvgWithinLimit(
            """<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>"""
        ))
        assertTrue(StandaloneWorkplacePolicy.isSafeSvgWithinLimit(
            """<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>"""
        ))
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        assertArrayEquals(png, StandaloneWorkplacePolicy.decodePngWithinLimit(
            java.util.Base64.getEncoder().encodeToString(png)
        ))
        assertNull(StandaloneWorkplacePolicy.decodePngWithinLimit("bm90LXBuZw=="))
    }
}