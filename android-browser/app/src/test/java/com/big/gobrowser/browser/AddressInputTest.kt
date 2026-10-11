package com.big.gobrowser.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AddressInputTest {
    @Test fun bareWebsiteFromOwnerScreenshotLoadsOverHttps() {
        assertEquals("https://www.google.co.th", UrlPolicy.resolveAddress("www.google.co.th"))
    }

    @Test fun domainPathQueryAndPortArePreserved() {
        assertEquals("https://example.com:8443/a?q=one#part", UrlPolicy.resolveAddress(" example.com:8443/a?q=one#part "))
        assertEquals("https://example.com/path", UrlPolicy.resolveAddress("//example.com/path"))
    }

    @Test fun explicitHttpsIsPreserved() {
        assertEquals("https://example.com/path?q=1", UrlPolicy.resolveAddress(" https://example.com/path?q=1 "))
    }

    @Test fun invalidAndNonWebSchemesStayBlocked() {
        for (input in listOf("", "not a url", "http://example.com", "javascript:alert(1)", "javascript:123", "mailto:user@example.com", "file:///etc/passwd", "intent://example.com", "https://", "/relative/path")) {
            assertNull(input, UrlPolicy.resolveAddress(input))
        }
    }
}
