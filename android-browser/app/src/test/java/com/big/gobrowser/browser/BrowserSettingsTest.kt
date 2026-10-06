package com.big.gobrowser.browser

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BrowserSettingsTest {
    @Test fun allowsHttpsOnly() {
        assertTrue(UrlPolicy.isAllowed("https://example.com/path"))
        assertFalse(UrlPolicy.isAllowed("http://example.com/path"))
        assertFalse(UrlPolicy.isAllowed("javascript:alert(1)"))
        assertFalse(UrlPolicy.isAllowed("not a url"))
    }
}
