package com.big.gobrowser.browser

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.ActivityTestRule
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import android.webkit.WebView
import android.widget.TextView
import android.view.View
import android.view.ViewGroup

/** Browser Mode is the remote controller UI; it does not instantiate GeckoView. */
@RunWith(AndroidJUnit4::class)
class RemoteBrowserActivityTest {
    @get:Rule val rule=ActivityTestRule(RemoteBrowserActivity::class.java)
    private fun all(root: View): List<View> = listOf(root) + if(root is ViewGroup)
        (0 until root.childCount).flatMap {all(root.getChildAt(it))} else emptyList()
    @Test fun remoteBrowserAndGoviewAreBothReachable() {
        val views=all(rule.activity.window.decorView)
        assertTrue(views.any{it is WebView})
        val labels=views.filterIsInstance<TextView>().map{it.text.toString()}
        assertTrue(labels.any{it.contains("GOVIEW")})
        assertTrue(labels.any{it.contains("Browser")})
        assertTrue(labels.any{it.contains("GO")})
        assertTrue(labels.any{it.contains("เบื้องหลัง")})
    }
}
