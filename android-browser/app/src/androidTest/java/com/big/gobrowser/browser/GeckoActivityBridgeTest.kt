package com.big.gobrowser.browser

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class GeckoActivityBridgeTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private fun intent() = PendingIntent.getActivity(instrumentation.targetContext, 73,
        Intent(instrumentation.targetContext, GeckoBrowserActivity::class.java), PendingIntent.FLAG_IMMUTABLE)

    @Test fun providerResultReachesGeckoUnchangedAndOnlyMatchingRequestIsConsumed() {
        val done = CountDownLatch(1)
        var actual: Intent? = null
        var failure: Throwable? = null
        val data = Intent().putExtra("provider-result", byteArrayOf(1, 2, 3))
        instrumentation.runOnMainSync {
            var launches = 0
            val bridge = GeckoActivityBridge({ true }) { _, code -> launches++; assertEquals(7301, code) }
            bridge.onStartActivityForResult(intent()).accept({ actual = it; done.countDown() }, { failure = it; done.countDown() })
            assertFalse(bridge.onActivityResult(99, Activity.RESULT_OK, data))
            assertTrue(bridge.onActivityResult(7301, Activity.RESULT_OK, data))
            assertEquals(1, launches)
        }
        assertTrue(done.await(5, TimeUnit.SECONDS))
        assertNull(failure)
        assertSame(data, actual)
    }

    @Test fun cancellationRejectsGeckoRequestInsteadOfLeavingItWaiting() {
        val done = CountDownLatch(1)
        var error: Throwable? = null
        instrumentation.runOnMainSync {
            val bridge = GeckoActivityBridge({ true }) { _, _ -> }
            bridge.onStartActivityForResult(intent()).accept({ done.countDown() }, { error = it; done.countDown() })
            bridge.onActivityResult(7301, Activity.RESULT_CANCELED, null)
        }
        assertTrue(done.await(5, TimeUnit.SECONDS))
        assertEquals("AUTHENTICATION_CANCELLED_OR_EMPTY", error?.message)
    }

    @Test fun concurrentRequestsAndDestroyedActivityRejectWithoutExtraLaunch() {
        val done = CountDownLatch(3)
        val errors = java.util.Collections.synchronizedList(mutableListOf<String>())
        instrumentation.runOnMainSync {
            var launches = 0
            val bridge = GeckoActivityBridge({ true }) { _, _ -> launches++ }
            fun collect(result: org.mozilla.geckoview.GeckoResult<Intent>) {
                result.accept({ done.countDown() }, { errors.add(it?.message.orEmpty()); done.countDown() })
            }
            collect(bridge.onStartActivityForResult(intent()))
            collect(bridge.onStartActivityForResult(intent()))
            bridge.cancel()
            collect(GeckoActivityBridge({ false }) { _, _ -> launches++ }.onStartActivityForResult(intent()))
            assertEquals(1, launches)
        }
        assertTrue(done.await(5, TimeUnit.SECONDS))
        assertEquals(setOf("AUTHENTICATION_ALREADY_PENDING", "ACTIVITY_DESTROYED", "ACTIVITY_NOT_FOREGROUND"), errors.toSet())
    }
}
