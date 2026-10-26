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
        assertTrue(labels.any{it.contains("ฉันควบคุมเอง")})
        assertTrue(labels.any{it.contains("หยุด GO")})
    }
    @Test fun groupedMenusKeepControlRecoveryAndBackgroundReachable() {
        // A fresh app opens connection settings; dismiss only that UI before exercising controls.
        runCatching {
            androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("ยกเลิก"))
                .inRoot(androidx.test.espresso.matcher.RootMatchers.isDialog())
                .perform(androidx.test.espresso.action.ViewActions.click())
        }
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("เพิ่มเติม"))
            .perform(androidx.test.espresso.action.ViewActions.click())
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("🌙 เบื้องหลัง"))
            .inRoot(androidx.test.espresso.matcher.RootMatchers.isDialog())
            .check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
        androidx.test.espresso.Espresso.pressBack()
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("⏹ หยุด GO"))
            .perform(androidx.test.espresso.action.ViewActions.click())
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("เพิกถอนสิทธิ์ GO ดู"))
            .inRoot(androidx.test.espresso.matcher.RootMatchers.isDialog())
            .check(androidx.test.espresso.assertion.ViewAssertions.matches(androidx.test.espresso.matcher.ViewMatchers.isDisplayed()))
        androidx.test.espresso.Espresso.pressBack()
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("GO · ดู / ทำ"))
            .perform(androidx.test.espresso.action.ViewActions.click())
        androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("👁 เชิญ GO ดู"))
            .inRoot(androidx.test.espresso.matcher.RootMatchers.isDialog())
            .perform(androidx.test.espresso.action.ViewActions.click())
        assertTrue(all(rule.activity.window.decorView).filterIsInstance<TextView>().any {it.text.toString()=="เปิดเว็บไซต์ก่อน"})
    }

    @Test fun workspaceReflowsWithSplitWindowsShortHeightAndLargeText() {
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val configuration=android.content.res.Configuration(rule.activity.resources.configuration).apply {fontScale=2f}
            val context=rule.activity.createConfigurationContext(configuration)
            val workspace=com.big.gobrowser.ui.AdaptiveWorkspace(context)
            var clicks=0
            repeat(12) { index ->
                workspace.commands.addView(com.big.gobrowser.ui.ObservatoryTheme.button(context,"คำสั่ง $index · ข้อความขนาดใหญ่") {clicks++})
            }
            val density=context.resources.displayMetrics.density
            listOf(Triple(360,640,false),Triple(700,700,true),Triple(1000,700,true),Triple(640,260,true),Triple(360,200,true)).forEach {(width,height,side)->
                val w=(width*density).toInt();val h=(height*density).toInt()
                workspace.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY))
                workspace.layout(0,0,w,h)
                assertEquals("window $width x $height",side,workspace.sidePanel)
                assertTrue("canvas retains usable height",workspace.canvas.height>=48*density)
                assertTrue("canvas retains usable width",workspace.canvas.width>=48*density)
                assertTrue(workspace.canvas.right<=w&&workspace.canvas.bottom<=h)
                val panel=all(workspace).filterIsInstance<android.widget.ScrollView>().single()
                assertTrue("overflow remains scrollable",panel.getChildAt(0).height>panel.height)
                panel.fullScroll(View.FOCUS_DOWN)
                val last=workspace.commands.getChildAt(11)
                assertTrue(last.height>=48*density)
                assertTrue(last.performClick())
            }
            assertEquals(5,clicks)
        }
    }

    @Test fun fullBrowserHierarchyRetainsCanvasInShortWindowWithLargeText() {
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val content=rule.activity.findViewById<ViewGroup>(android.R.id.content)
            val root=content.getChildAt(0)
            val labels=all(root).filterIsInstance<TextView>()
            val originalSizes=labels.map {it.textSize}
            val workspace=all(root).filterIsInstance<com.big.gobrowser.ui.AdaptiveWorkspace>().single()
            val web=all(root).filterIsInstance<WebView>().single()
            val density=rule.activity.resources.displayMetrics.density
            val width=(320*density).toInt();val height=(180*density).toInt()
            try {
                labels.forEachIndexed {i,v->v.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX,originalSizes[i]*2)}
                root.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY))
                root.layout(0,0,width,height)
                assertTrue(workspace.canvas.width>=48*density)
                assertTrue(workspace.canvas.height>=48*density)
                assertSame(web,all(root).filterIsInstance<WebView>().single())
                val safety=labels.single {it.text.toString()=="⏹ หยุด GO"}
                assertTrue(safety.height>=48*density)
                assertTrue("safety starts within the scrollable panel",safety.top==0)
            } finally {
                labels.forEachIndexed {i,v->v.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX,originalSizes[i])}
                root.requestLayout()
            }
        }
    }

}
