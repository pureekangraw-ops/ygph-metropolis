package com.big.gobrowser.browser

import org.junit.Assert.*
import org.junit.Test

class FocusEvidencePolicyTest {
    @Test fun retainsFocusIdentityButDropsSensitiveDumpContent() {
        val raw="""mCurrentFocus=Window{abc123 u0 com.android.permissioncontroller/.GrantPermissionsActivity title=secret-token private.example/account https://private.example/path?token=secret}
            mResumedActivity=ActivityRecord{def456 u0 com.big.gobrowser/.outsideview.OutsideViewActivity Intent { extras=private-note }}
            clipboard=private-note password=secret-token
            mWakefulness=Awake
            mKeyguardShowing=true"""
        val result=FocusEvidencePolicy.sanitize(raw)
        assertTrue(result.contains("com.android.permissioncontroller/.GrantPermissionsActivity"))
        assertTrue(result.contains("abc123"));assertTrue(result.contains("Awake"))
        for(secret in listOf("secret-token","private-note","https://","clipboard","extras=","private.example"))assertFalse(result.contains(secret))
    }
    @Test fun boundsInputAndOutput() {
        val result=FocusEvidencePolicy.sanitize("mCurrentFocus=Window{abc123 u0 com.example/.Activity}\n".repeat(20000))
        assertTrue(result.length<=FocusEvidencePolicy.MAX_OUTPUT)
        assertEquals("",FocusEvidencePolicy.sanitize("x".repeat(FocusEvidencePolicy.MAX_INPUT)+"\nmWakefulness=Awake"))
    }
    @Test fun diagnosticFailureCannotMaskOriginalAndCapturePrecedesCleanup() {
        val original=AssertionError("synthetic original")
        val events=mutableListOf<String>()
        try {
            try {FocusEvidencePolicy.preserveFailure(original){events+="capture";error("synthetic dump error")}}
            finally {events+="cleanup"}
        } catch(actual:Throwable) {assertSame(original,actual)}
        assertEquals(listOf("capture","cleanup"),events)
    }
}
