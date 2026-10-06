package com.big.gobrowser.browser

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.big.gobrowser.control.*
import com.big.gobrowser.observer.WebViewObserver
import com.big.gobrowser.transport.AndroidDeviceCredentialStore
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Offline fixtures exercise native JSON marshalling and the real WebView runtime. */
@RunWith(AndroidJUnit4::class)
class ObserverDispatchTest {
    @Test fun capturedVisibleTargetIsDispatchedThroughNativeBoundary() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val ready = CountDownLatch(1)
        val done = CountDownLatch(1)
        var accepted = false
        var clicks: String? = null
        lateinit var view: WebView
        instrumentation.runOnMainSync {
            view = WebView(instrumentation.targetContext)
            BrowserSettings.configure(view)
            view.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) { ready.countDown() }
            }
            view.loadDataWithBaseURL("https://fixture.invalid/", """
                <html><body><button style="display:none">Hidden</button>
                <input type="password"><button onclick="window.fixtureClicks=(window.fixtureClicks||0)+1">Wanted</button></body></html>
            """.trimIndent(), "text/html", "UTF-8", null)
        }
        try {
            assertTrue("Fixture page loaded", ready.await(10, TimeUnit.SECONDS))
            instrumentation.runOnMainSync {
                WebViewObserver(instrumentation.targetContext, view).capture { capture ->
                    if (capture == null) { done.countDown(); return@capture }
                    val command = Command("command", "GO", "work", "checkpoint", "tab", "device", capture.captureId,
                        1, 0, 0, 30000, BrowserAction.CLICK, "browser.click", mapOf("targetId" to "target-0"))
                    WebViewCommandDispatcher(view).dispatch(command) { result ->
                        accepted = result.accepted
                        view.evaluateJavascript("window.fixtureClicks || 0") { clicks = it; done.countDown() }
                    }
                }
            }
            assertTrue("Native dispatch completed", done.await(10, TimeUnit.SECONDS))
            assertTrue(accepted)
            assertEquals("1", clicks)
        } finally { instrumentation.runOnMainSync { view.destroy() } }
    }

    @Test fun keystoreCredentialRoundTripAndRevocation() {
        val store = AndroidDeviceCredentialStore(InstrumentationRegistry.getInstrumentation().targetContext)
        store.revoke()
        try {
            store.save("fixture-token")
            assertEquals("fixture-token", store.load())
            store.revoke()
            assertNull(store.load())
            store.save("replacement-token")
            assertEquals("replacement-token", store.load())
        } finally { store.revoke() }
    }
}
