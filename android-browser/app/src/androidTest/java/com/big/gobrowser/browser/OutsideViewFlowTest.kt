package com.big.gobrowser.browser

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.RootMatchers.isDialog
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import com.big.gobrowser.outsideview.*
import com.big.gobrowser.ui.ObservatoryTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class OutsideViewFlowTest {
    @get:Rule val rule=ActivityTestRule(OutsideViewActivity::class.java)
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap {views(v.getChildAt(it))}else emptyList()
    private fun rendered(store:MapStateStore, predicate:()->Boolean) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(25)
        while(System.nanoTime()<deadline){
            val journal=store.load()
            if(journal.pending==null&&journal.renderedRevision==journal.state.revision&&predicate())return
            Thread.sleep(100)
        }
        fail("Map did not complete a matching rendered revision")
    }
    @Test fun phoneMapControlsSaveAndFocusAnOwnerPin() {
        val store=MapStateStore(rule.activity)
        val before=store.load().state.pins.size
        instrumentation.runOnMainSync {
            val field=OutsideViewActivity::class.java.getDeclaredField("renderer").apply {isAccessible=true}
            val renderer=field.get(rule.activity) as MapLibreOutsideRenderer
            renderer.mapView.getMapAsync {renderer.reloadStyle(false)}
        }
        rendered(store){true}
        instrumentation.runOnMainSync {
            val root=rule.activity.window.decorView
            val buttons=views(root).filterIsInstance<Button>()
            val send=buttons.single {it.text.toString()=="ส่งแผนที่เข้า PANTHEON"}
            val position=IntArray(2);send.getLocationOnScreen(position)
            assertTrue(position[0]>=0&&position[0]+send.width<=root.width)
            assertTrue(send.height>=ObservatoryTheme.dp(rule.activity,48))
            assertTrue(views(root).any {it is org.maplibre.android.maps.MapView&&it.height>=ObservatoryTheme.dp(rule.activity,200)})
        }
        onView(withText("บันทึกจุด")).perform(click())
        onView(isAssignableFrom(EditText::class.java)).inRoot(isDialog()).perform(replaceText("Owner flow pin"),closeSoftKeyboard())
        onView(withText("บันทึก")).inRoot(isDialog()).perform(click())
        rendered(store){store.load().state.pins.size==before+1}
        onView(withText("จุดของฉัน")).perform(click())
        onView(withText("Owner flow pin")).inRoot(isDialog()).perform(click())
        onView(withText("ดูบนแผนที่")).inRoot(isDialog()).perform(click())
        rendered(store){store.load().state.focused!=null}
        val focused=store.load().state.focused
        assertTrue(store.load().state.pins.containsKey(focused))
        onView(withText("เพิ่มเติม")).perform(click())
        onView(withText("ลองแสดงใหม่")).inRoot(isDialog()).check(androidx.test.espresso.assertion.ViewAssertions.matches(isDisplayed()))
        instrumentation.uiAutomation.takeScreenshot()?.let {image->
            java.io.File(rule.activity.getExternalFilesDir(null),"observatory-map-flow.png").outputStream().use {image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
        }
    }
}
