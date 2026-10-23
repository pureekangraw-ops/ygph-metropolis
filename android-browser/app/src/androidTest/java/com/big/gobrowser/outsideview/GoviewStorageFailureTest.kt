package com.big.gobrowser.outsideview

import android.widget.TextView
import android.widget.Button
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class GoviewStorageFailureTest {
    /** Exercise the actual Activity read/error UI without opening or altering its real storage. */
    @Test fun corruptSyntheticStoreDisablesUiWritesAndSharesFromMainAndWorkerReads() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val root=File(instrumentation.targetContext.cacheDir,"goview-bad-${System.nanoTime()}").apply {mkdirs()}
        val file=File(root,"journal.json").apply {writeText("corrupt synthetic journal")}
        lateinit var activity:OutsideViewActivity
        lateinit var status:TextView
        lateinit var share:Button
        val type=OutsideViewActivity::class.java
        fun set(name:String,value:Any){type.getDeclaredField(name).apply {isAccessible=true}.set(activity,value)}
        val read=type.getDeclaredMethod("readJournal").apply {isAccessible=true}
        try {
            instrumentation.runOnMainSync {
                activity=OutsideViewActivity()
                status=TextView(instrumentation.targetContext);share=Button(instrumentation.targetContext)
                set("store",MapStateStore(root));set("status",status);set("shareButton",share)
                assertNull(read.invoke(activity))
                type.getDeclaredMethod("listPins",String::class.java).apply {isAccessible=true}.invoke(activity,"")
                type.getDeclaredMethod("noteDialog",String::class.java,String::class.java).apply {isAccessible=true}.invoke(activity,"synthetic","Synthetic")
            }
            val failure=java.util.concurrent.atomic.AtomicReference<Throwable>()
            val thread=Thread {try{assertNull(read.invoke(activity))}catch(t:Throwable){failure.set(t)}}
            thread.start();thread.join(5000);assertFalse(thread.isAlive);assertNull(failure.get())
            instrumentation.waitForIdleSync()
            instrumentation.runOnMainSync {assertFalse(share.isEnabled);assertTrue(status.text.toString().contains("ไฟล์เดิมยังอยู่"))}
            assertEquals("corrupt synthetic journal",file.readText())
            assertFalse(File(root,"journal.json.tmp").exists())
        }finally{root.deleteRecursively()}
    }
}
