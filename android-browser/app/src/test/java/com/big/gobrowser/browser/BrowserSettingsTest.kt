package com.big.gobrowser.browser

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BrowserSettingsTest {
    @Test fun allowsHttpsOnly() {
        assertTrue(BrowserSettings.isAllowedUrl("https://example.com/path"))
        assertFalse(BrowserSettings.isAllowedUrl("http://example.com/path"))
        assertFalse(BrowserSettings.isAllowedUrl("javascript:alert(1)"))
        assertFalse(BrowserSettings.isAllowedUrl("not a url"))
    }
}
