package com.big.gobrowser.browser

import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import com.big.gobrowser.control.*
import com.big.gobrowser.observer.WebViewObserver
import com.big.gobrowser.transport.AndroidDeviceCredentialStore
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Offline fixtures exercise native JSON marshalling and the real WebView runtime. */
@RunWith(AndroidJUnit4::class)
class ObserverDispatchTest {
    @get:Rule val activityRule = ActivityTestRule(BrowserActivity::class.java)

    @Test fun capturedVisibleTargetIsDispatchedThroughNativeBoundary() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val ready = CountDownLatch(1)
        val done = CountDownLatch(1)
        var accepted = false
        var reason: String? = null
        var clicks: String? = null
        var targetSummary = ""
        lateinit var view: WebView
        lateinit var host: ViewGroup
        instrumentation.runOnMainSync {
            host = activityRule.activity.findViewById(android.R.id.content)
            view = WebView(instrumentation.targetContext)
            host.addView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
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
                    if (capture == null) { reason = "CAPTURE_NULL"; done.countDown(); return@capture }
                    targetSummary = capture.targets.joinToString { "${it.id}:${it.kind}:${it.label}" }
                    val target = capture.targets.firstOrNull { it.label == "Wanted" }
                    if (target == null) { reason = "TARGET_NOT_CAPTURED:$targetSummary"; done.countDown(); return@capture }
                    val command = Command("command", "GO", "work", "checkpoint", "tab", "device", capture.captureId,
                        1, 0, 0, 30000, BrowserAction.CLICK, "browser.click", mapOf("targetId" to target.id))
                    WebViewCommandDispatcher(view).dispatch(command) { result ->
                        accepted = result.accepted
                        reason = result.reason
                        view.evaluateJavascript("window.fixtureClicks || 0") { clicks = it; done.countDown() }
                    }
                }
            }
            assertTrue("Native dispatch completed reason=$reason targets=$targetSummary", done.await(10, TimeUnit.SECONDS))
            assertTrue("Dispatch rejected: reason=$reason targets=$targetSummary", accepted)
            assertEquals("Expected click readback, reason=$reason targets=$targetSummary", "1", clicks)
        } finally {
            instrumentation.runOnMainSync {
                host.removeView(view)
                view.destroy()
            }
        }
    }

    @Test fun keystoreCredentialRoundTripAndRevocation() {
        val store = AndroidDeviceCredentialStore(InstrumentationRegistry.getInstrumentation().targetContext,
            keyAlias = "go-browser-instrumentation-only", preferencesName = "relay-credential-instrumentation-only")
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
    @Test fun stationLocalRevocationSurvivesCancelledNetworkDelivery() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val prefs="station-revoke-test";val alias="station-revoke-test-key";val credentials="station-revoke-test-token"
        val credential=AndroidDeviceCredentialStore(context,alias,credentials)
        val settings=context.getSharedPreferences(prefs,android.content.Context.MODE_PRIVATE)
        try {
            credential.save("fixture-token")
            settings.edit().putString("connection","{\"browser\":{\"disconnect\":\"https://fixture.invalid/disconnect\"}}").commit()
            val station=com.big.gobrowser.transport.ObservatoryStationConnection(context,prefs,alias,credentials)
            station.revokeLocally() // Deliberately never run the returned network callback.
            val restarted=com.big.gobrowser.transport.ObservatoryStationConnection(context,prefs,alias,credentials)
            assertNull(restarted.saved());assertNull(restarted.token())
        } finally {credential.revoke();settings.edit().clear().commit()}
    }
}
