package com.big.gobrowser.browser

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.view.inputmethod.EditorInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Starts the installable Observatory activity and proves a real GeckoView/GeckoSession is attached. */
@RunWith(AndroidJUnit4::class)
class GeckoBrowserE2ETest {
    @get:Rule val rule = ActivityTestRule(GeckoBrowserActivity::class.java)
    private fun find(view: View): View? = if (view is org.mozilla.geckoview.GeckoView) view else if (view is ViewGroup) (0 until view.childCount).asSequence().mapNotNull { find(view.getChildAt(it)) }.firstOrNull() else null
    @Test fun activityAttachesRealGeckoViewSession() {
        val view = find(rule.activity.window.decorView)
        instrumentation.runOnMainSync { assertNotNull("WebAuthn provider activity delegate must be attached", engine().runtime().activityDelegate) }
        assertNotNull("GeckoView must be attached to the Observatory activity", view)
        assertTrue("Gecko browser activity remains usable", !rule.activity.isFinishing)
    }

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private fun views(v: View): List<View> = listOf(v) + if (v is ViewGroup) (0 until v.childCount).flatMap { views(v.getChildAt(it)) } else emptyList()
    private fun engine(): GeckoBrowserEngine = GeckoBrowserActivity::class.java.getDeclaredField("engine").let {
        it.isAccessible = true; it.get(rule.activity) as GeckoBrowserEngine
    }

    @Test fun goButtonAcceptsBareWebsiteFromOwnerScreenshot() {
        instrumentation.runOnMainSync {
            val controls = views(rule.activity.window.decorView)
            controls.filterIsInstance<EditText>().single().setText("www.google.co.th")
            controls.filterIsInstance<Button>().single { it.text.toString() == "ไป" }.performClick()
            assertEquals("https://www.google.co.th", engine().active()!!.requestedUrl)
        }
    }

    @Test fun keyboardGoLoadsTwoExternalSitesAndObservesTheirActualDom() {
        // Do not require the startup home page to be online before navigating:
        // a restored tab may still be loading or offline on the emulator. Verify
        // real DOM for each owner-entered destination below instead.
        instrumentation.waitForIdleSync()
        for (host in listOf("example.com", "example.org")) {
            instrumentation.runOnMainSync {
                val address = views(rule.activity.window.decorView).filterIsInstance<EditText>().single()
                address.setText(host)
                address.onEditorAction(EditorInfo.IME_ACTION_GO)
                assertEquals("https://$host", engine().active()!!.requestedUrl)
            }
            val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(45)
            var loaded = false
            var actual = ""
            while (!loaded && System.nanoTime() < deadline) {
                instrumentation.runOnMainSync {
                    val capture = currentCapture()
                    actual = "active=${engine().active()?.requestedUrl}, DOM=${capture?.url}, title=${capture?.title}, text=${capture?.text?.take(160)}"
                    loaded = capture != null && android.net.Uri.parse(capture.url).host == host
                        && capture.title == "Example Domain" && capture.text.isNotBlank()
                }
                if (!loaded) Thread.sleep(100)
            }
            assertTrue("Real Gecko DOM must load from $host after keyboard Go: $actual", loaded)
        }
        verifyReadableChromeAndMenu()
    }

    private fun verifyReadableChromeAndMenu() {
        instrumentation.waitForIdleSync()
        instrumentation.runOnMainSync {
            val decor = rule.activity.window.decorView
            val content = rule.activity.findViewById<ViewGroup>(android.R.id.content)
            val root = content.getChildAt(0)
            val usableHeight = root.height - root.paddingTop - root.paddingBottom
            val gecko = find(decor)!!
            assertTrue("Webpage must occupy at least 70% of the usable portrait screen", gecko.height >= usableHeight * 0.70)
            val minimumTouch = (48 * rule.activity.resources.displayMetrics.density).toInt()
            for (control in views(decor).filterIsInstance<Button>()) {
                assertTrue("Primary buttons need a 48dp touch target: ${control.contentDescription}", control.width >= minimumTouch && control.height >= minimumTouch)
                val bounds = android.graphics.Rect()
                assertTrue("Every primary button must be fully visible", control.getGlobalVisibleRect(bounds) && bounds.width() == control.width && bounds.height() == control.height)
            }
            android.util.Log.i("ObservatoryChrome", "viewport=${gecko.height}/$usableHeight width=${root.width}")
        }
        screenshot("observatory-gecko-browser.png")
        instrumentation.runOnMainSync {
            views(rule.activity.window.decorView).filterIsInstance<Button>().single { it.contentDescription == "เมนูหอดูดาว" }.performClick()
        }
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("เก็บช่วงนี้ถาวร"))
            .check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("ช่วงที่เก็บไว้"))
            .check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
        screenshot("observatory-gecko-menu.png")
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("รายละเอียดและข้อมูลรุ่น")).perform(androidx.test.espresso.action.ViewActions.click())
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("สถานะหอดูดาว"))
            .check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
        screenshot("observatory-gecko-details.png")
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("ปิด")).perform(androidx.test.espresso.action.ViewActions.click())
    }

    private fun screenshot(name: String) {
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        assertNotNull("Actual device screenshot must be available", bitmap)
        val file = java.io.File(instrumentation.targetContext.getExternalFilesDir(null), name)
        file.outputStream().use { bitmap!!.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        bitmap!!.recycle()
        // Gradle removes the test app afterwards; keep evidence outside its data directory.
        instrumentation.uiAutomation.executeShellCommand("cp ${file.absolutePath} /data/local/tmp/$name").use {
            java.io.FileInputStream(it.fileDescriptor).use { stream -> stream.readBytes() }
        }
    }

    private fun currentCapture(): DomCapture? {
        val field = GeckoBrowserActivity::class.java.getDeclaredField("latestDom").apply { isAccessible = true }
        return (field.get(rule.activity) as? Pair<*, *>)?.second as? DomCapture
    }

    @Test fun editingAddressIsNotOverwrittenByPageNavigation() {
        instrumentation.runOnMainSync {
            val address = views(rule.activity.window.decorView).filterIsInstance<EditText>().single()
            val tab = engine().active()!!
            address.requestFocus()
            address.setText("example.org/draft")
            tab.session.navigationDelegate!!.onLocationChange(tab.session, "https://example.com/redirect", emptyList(), false)
            assertEquals("example.org/draft", address.text.toString())
            address.clearFocus()
            tab.session.navigationDelegate!!.onLocationChange(tab.session, "https://example.com/final", emptyList(), false)
            assertEquals("https://example.com/final", address.text.toString())
        }
    }

    @Test fun killedSessionRecoveryReattachesTheExistingView() {
        instrumentation.runOnMainSync {
            traceRecoveryNavigation()
            assertTrue("Initial navigation must be accepted", engine().navigate("https://example.com"))
            trace("navigate-return requested=${engine().active()?.requestedUrl}")
        }
        awaitPage("example.com")
        var previousCaptureId: String? = null
        instrumentation.runOnMainSync {
            previousCaptureId = currentCapture()?.captureId
            val tab = engine().active()!!
            val view = find(rule.activity.window.decorView) as org.mozilla.geckoview.GeckoView
            trace("explicit-kill requested=${tab.requestedUrl}")
            tab.session.close()
            tab.session.contentDelegate!!.onKill(tab.session)
            assertTrue("Recovered session must be open", tab.session.isOpen)
            org.junit.Assert.assertSame("Recovered page must return to the visible view", tab.session, view.session)
        }
        awaitPage("example.com", previousCaptureId)
    }

    @Test fun closingInactiveTabKeepsSelectedSessionVisible() {
        instrumentation.runOnMainSync {
            val previous = engine().active()!!
            val selected = engine().open("https://example.org")
            val active = engine().active()!!
            engine().close(previous.id)
            assertEquals(selected, engine().active()!!.id)
            val view = find(rule.activity.window.decorView) as org.mozilla.geckoview.GeckoView
            org.junit.Assert.assertSame(active.session, view.session)
            assertTrue(active.session.isOpen)
        }
    }

    @Test fun reopeningActivityRestoresSelectedTabAndLoadsItsPage() {
        lateinit var originalTabs: List<GeckoBrowserEngine.GeckoTab>
        lateinit var selectedId: String
        instrumentation.runOnMainSync {
            selectedId = engine().open("https://example.org")
            engine().open("https://example.com")
            engine().select(selectedId)
            originalTabs = engine().list()
        }
        awaitPage("example.org")
        val originalActivity=rule.activity
        val destroyed=java.util.concurrent.CountDownLatch(1)
        val monitor=androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
        val callback=androidx.test.runner.lifecycle.ActivityLifecycleCallback { activity, stage ->
            if(activity===originalActivity&&stage==androidx.test.runner.lifecycle.Stage.DESTROYED)destroyed.countDown()
        }
        instrumentation.runOnMainSync {monitor.addLifecycleCallback(callback)}
        try {
            rule.finishActivity()
            assertTrue("Original Activity must reach DESTROYED",destroyed.await(5,java.util.concurrent.TimeUnit.SECONDS))
        } finally {instrumentation.runOnMainSync {monitor.removeLifecycleCallback(callback)}}
        // The lifecycle monitor signals DESTROYED before the framework finishes onDestroy.
        // Await actual session disposal rather than racing that notification.
        val closeDeadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(5)
        var closed=false
        while(!closed&&System.nanoTime()<closeDeadline){
            instrumentation.runOnMainSync {closed=originalTabs.all {!it.session.isOpen}}
            if(!closed)Thread.sleep(50)
        }
        assertTrue("Destroyed Activity must release all sessions",closed)
        rule.launchActivity(android.content.Intent(instrumentation.targetContext, GeckoBrowserActivity::class.java))
        instrumentation.runOnMainSync { assertEquals("Restore must retain selected tab, not last record", selectedId, engine().active()!!.id) }
        awaitPage("example.org")
    }

    // Diagnostics retain original delegates and assertions; URLs are synthetic test destinations.
    private fun trace(event: String) = android.util.Log.i("GeckoRecoveryTrace", event)
    private fun traceRecoveryNavigation() {
        val tab=engine().active()!!
        trace("begin tab=${tab.id} requested=${tab.requestedUrl} open=${tab.session.isOpen}")
        val navigation=tab.session.navigationDelegate!!
        tab.session.navigationDelegate=object : org.mozilla.geckoview.GeckoSession.NavigationDelegate by navigation {
            override fun onLoadRequest(session: org.mozilla.geckoview.GeckoSession, request: org.mozilla.geckoview.GeckoSession.NavigationDelegate.LoadRequest): org.mozilla.geckoview.GeckoResult<org.mozilla.geckoview.AllowOrDeny>? {
                trace("load-request uri=${request.uri} requested=${tab.requestedUrl}")
                return navigation.onLoadRequest(session,request)
            }
            override fun onLocationChange(session: org.mozilla.geckoview.GeckoSession, url: String?, permissions: List<org.mozilla.geckoview.GeckoSession.PermissionDelegate.ContentPermission>, hasUserGesture: Boolean) {
                trace("location before=${tab.requestedUrl} incoming=$url")
                navigation.onLocationChange(session,url,permissions,hasUserGesture)
                trace("location after=${tab.requestedUrl}")
            }
        }
        val progress=tab.session.progressDelegate!!
        tab.session.progressDelegate=object : org.mozilla.geckoview.GeckoSession.ProgressDelegate by progress {
            override fun onPageStop(session: org.mozilla.geckoview.GeckoSession, success: Boolean) {
                trace("page-stop success=$success requested=${tab.requestedUrl}")
                progress.onPageStop(session,success)
            }
            override fun onSessionStateChange(session: org.mozilla.geckoview.GeckoSession, state: org.mozilla.geckoview.GeckoSession.SessionState) {
                trace("session-state requested=${tab.requestedUrl}")
                progress.onSessionStateChange(session,state)
            }
        }
    }

    private fun awaitPage(host: String, previousCaptureId: String? = null) {
        val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(45)
        var loaded = false
        var previousDiagnostic=""
        while (!loaded && System.nanoTime() < deadline) {
            instrumentation.runOnMainSync {
                val capture = currentCapture()
                val diagnostic="await=$host requested=${engine().active()?.requestedUrl} captured=${capture?.url} title=${capture?.title}"
                if(diagnostic!=previousDiagnostic){trace(diagnostic);previousDiagnostic=diagnostic}
                loaded = capture != null && android.net.Uri.parse(capture.url).host == host
                    && capture.title == "Example Domain" && capture.text.isNotBlank()
                    && capture.captureId != previousCaptureId
            }
            if (!loaded) Thread.sleep(100)
        }
        var diagnostic=""
        if(!loaded)instrumentation.runOnMainSync {
            val capture=currentCapture()
            diagnostic="phase=${if(previousCaptureId==null) "initial" else "recovery"}, sessionOpen=${engine().active()?.session?.isOpen}, requested=${engine().active()?.requestedUrl}, captured=${capture?.url}, title=${capture?.title}, captureChanged=${capture?.captureId!=previousCaptureId}"
        }
        assertTrue("Actual DOM must load from $host ($diagnostic)", loaded)
    }
}


