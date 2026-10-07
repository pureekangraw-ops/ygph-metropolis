package com.big.gobrowser.browser

import android.widget.FrameLayout
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertSame
import android.view.View
import android.view.ViewGroup
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.ActivityTestRule
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Starts the installable Observatory activity and proves a real GeckoView/GeckoSession is attached. */
@RunWith(AndroidJUnit4::class)
class GeckoBrowserE2ETest {
    @get:Rule val rule = ActivityTestRule(GeckoBrowserActivity::class.java)
    @After fun closeActivity() { rule.finishActivity() }
    private fun find(view: View): View? = if (view is org.mozilla.geckoview.GeckoView) view else if (view is ViewGroup) (0 until view.childCount).asSequence().mapNotNull { find(view.getChildAt(it)) }.firstOrNull() else null
    @Test fun activityAttachesRealGeckoViewSession() {
        val view = find(rule.activity.window.decorView)
        assertNotNull("GeckoView must be attached to the Observatory activity", view)
        assertNotNull("A real GeckoSession must be attached", (view as org.mozilla.geckoview.GeckoView).session)
        assertTrue("Gecko browser activity remains usable", !rule.activity.isFinishing)
    }
    @Test fun crashReattachesRecoveredSessionToExistingView() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val container = FrameLayout(rule.activity)
            val view = org.mozilla.geckoview.GeckoView(rule.activity)
            container.addView(view)
            val engine = GeckoBrowserEngine(rule.activity, container, {}, { _, _ -> })
            engine.open(); engine.attach(view)
            val tab = engine.active()!!
            val delegate = tab.session.contentDelegate!!
            tab.session.close()
            delegate.onCrash(tab.session)
            assertSame("Recovery must retain the visible browser surface", tab.session, view.session)
            assertTrue("Recovered session must reopen", tab.session.isOpen)
            engine.detach(); engine.list().forEach { it.session.close() }
        }
    }
}

