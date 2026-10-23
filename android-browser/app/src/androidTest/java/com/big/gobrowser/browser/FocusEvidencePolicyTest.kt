package com.big.gobrowser.browser

import org.junit.Assert.*
import org.junit.Test

class FocusEvidencePolicyTest {
    private class RootViewWithoutFocusException:RuntimeException()
    @Test fun expectedPollsNeverCaptureOrConsumeFocusBudget() {
        val budget=FocusEvidencePolicy.CaptureBudget()
        val captured=mutableListOf<Int>()
        repeat(30) {
            val expected=AssertionError("Expected dialog not displayed yet")
            try {FocusEvidencePolicy.preserveFailure(expected){budget.claim(expected)?.let(captured::add)}}
            catch(actual:Throwable){assertSame(expected,actual)}
        }
        assertTrue(captured.isEmpty())
        val focus=RootViewWithoutFocusException()
        repeat(6) {assertEquals(it+1,budget.claim(IllegalStateException("wrapper",focus)))}
        assertNull(budget.claim(focus))
    }
    @Test fun explicitTypedProbeCapturesButSimilarTextDoesNot() {
        val budget=FocusEvidencePolicy.CaptureBudget(1)
        assertNull(budget.claim(AssertionError("synthetic-focus-probe")))
        assertEquals(1,budget.claim(RuntimeException(FocusEvidenceProbe())))
        assertNull(budget.claim(FocusEvidenceProbe()))
    }
    @Test fun cyclicUnrelatedCausesDoNotConsumeBudget() {
        val first=RuntimeException();val second=RuntimeException(first);first.initCause(second)
        val budget=FocusEvidencePolicy.CaptureBudget(1)
        assertNull(budget.claim(first))
        assertEquals(1,budget.claim(RootViewWithoutFocusException()))
    }
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
