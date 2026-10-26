package com.big.gobrowser.outsideview

import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DirectPollingStateTest {
    /** No credential client/store is created: busy UI must not consult its guard. */
    @Test fun busyPollTicksPreserveCurrentStatusBeforeReadingReconnectGuard() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        instrumentation.runOnMainSync {
            val type=OutsideViewActivity::class.java
            for(busy in listOf("directFetching","directPromptOpen","directSettingsOpen")) {
                val activity=OutsideViewActivity()
                fun set(name:String,value:Any) {type.getDeclaredField(name).apply {isAccessible=true}.set(activity,value)}
                val status=TextView(instrumentation.targetContext).apply {text="synthetic request still in progress"}
                try {
                    set("foreground",true);set("directStatus",status);set(busy,true)
                    val tick=type.getDeclaredMethod("pollDirect").apply {isAccessible=true}
                    repeat(3) {tick.invoke(activity)}
                    assertEquals("synthetic request still in progress",status.text.toString())
                } finally {
                    (type.getDeclaredField("worker").apply {isAccessible=true}.get(activity) as java.util.concurrent.ExecutorService).shutdown()
                }
            }
        }
    }
}
