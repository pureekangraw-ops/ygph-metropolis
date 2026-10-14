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
}

