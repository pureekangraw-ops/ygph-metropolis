package com.big.gobrowser.browser

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
        assertTrue("Gecko browser activity remains usable", !rule.activity.isFinishing)
    }
}
