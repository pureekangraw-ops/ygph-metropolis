package com.big.gobrowser.browser

import com.big.gobrowser.observer.Target
import org.junit.Assert.*
import org.junit.Test

class BrowserAssistPolicyTest {
    private fun target(tag: String = "input", type: String = "text", label: String = "Search", autocomplete: String = "",
                       frame: String = "frame-0", href: String? = null, disabled: Boolean = false) =
        Target("frame-0::target-1", null, label, type, 0, 0, 100, 30,
            frameId = frame, tag = tag, type = type, href = href, disabled = disabled,
            signature = "signed-target", autocomplete = autocomplete)

    @Test fun permitsOwnerApprovedTextInput() {
        assertNull(BrowserAssistPolicy.rejection(target(), "FILL", "a search phrase"))
        assertNull(BrowserAssistPolicy.rejection(target(tag = "textarea", type = "textarea"), "FILL", "notes"))
    }

    @Test fun refusesSecretsAndOneTimeCodes() {
        assertEquals("SENSITIVE_TARGET", BrowserAssistPolicy.rejection(target(label = "Password"), "FILL", "secret"))
        assertEquals("SENSITIVE_TARGET", BrowserAssistPolicy.rejection(target(autocomplete = "cc-number"), "FILL", "4111"))
        assertEquals("SENSITIVE_TARGET", BrowserAssistPolicy.rejection(target(autocomplete = "one-time-code"), "FILL", "123456"))
    }

    @Test fun refusesImpactfulAndUnsafeClicks() {
        assertEquals("SUBMIT_REQUIRES_OWNER", BrowserAssistPolicy.rejection(target(tag = "button", type = "submit", label = "Pay"), "CLICK"))
        assertEquals("SUBMIT_REQUIRES_OWNER", BrowserAssistPolicy.rejection(target(tag = "button", type = "submit", label = "Next"), "CLICK"))
        assertEquals("HIGH_IMPACT_REQUIRES_OWNER", BrowserAssistPolicy.rejection(target(tag = "button", type = "button", label = "Delete account"), "CLICK"))
        assertEquals("UNSAFE_LINK", BrowserAssistPolicy.rejection(target(tag = "a", type = "a", label = "Open link", href = "http://example.com"), "CLICK"))
        assertNull(BrowserAssistPolicy.rejection(target(tag = "a", type = "a", label = "Learn more", href = "https://example.com"), "CLICK"))
    }

    @Test fun rejectsStaleOrWrongFrameAndInvalidFields() {
        assertEquals("FRAME_NOT_SUPPORTED", BrowserAssistPolicy.rejection(target(frame = "frame-other"), "FILL", "X"))
        assertEquals("TARGET_NOT_INTERACTIVE", BrowserAssistPolicy.rejection(target(disabled = true), "FILL", "X"))
        assertEquals("NOT_TEXT_FIELD", BrowserAssistPolicy.rejection(target(type = "file"), "FILL", "X"))
        assertEquals("VALUE_TOO_LONG", BrowserAssistPolicy.rejection(target(), "FILL", "x".repeat(2001)))
    }
}
