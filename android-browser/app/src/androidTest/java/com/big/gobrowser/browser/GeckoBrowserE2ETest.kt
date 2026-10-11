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
        // The previous activity persisted a tab. Let its asynchronous Gecko restore complete
        // before simulating the owner's next address entry, rather than racing startup.
        val readyDeadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(45)
        var ready = false
        while (!ready && System.nanoTime() < readyDeadline) {
            instrumentation.runOnMainSync { ready = currentCapture() != null }
            if (!ready) Thread.sleep(100)
        }
        assertTrue("Restored browser must produce its initial DOM before navigation", ready)
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
                    loaded = capture != null && android.net.Uri.parse(capture.url).host == host && capture.text.contains("Example Domain")
                }
                if (!loaded) Thread.sleep(100)
            }
            assertTrue("Real Gecko DOM must load from $host after keyboard Go: $actual", loaded)
        }
    }

    private fun currentCapture(): DomCapture? {
        val field = GeckoBrowserActivity::class.java.getDeclaredField("latestDom").apply { isAccessible = true }
        return (field.get(rule.activity) as? Pair<*, *>)?.second as? DomCapture
    }
}

