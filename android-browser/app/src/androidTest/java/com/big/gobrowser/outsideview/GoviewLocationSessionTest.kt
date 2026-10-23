package com.big.gobrowser.outsideview

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import androidx.test.rule.GrantPermissionRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith

/** CI emulator only: proves lifecycle/notification controls, not a real GPS fix or Xiaomi battery behavior. */
@RunWith(AndroidJUnit4::class)
class GoviewLocationSessionTest {
    private val activity=ActivityTestRule(OutsideViewActivity::class.java)
    @get:Rule val rules:RuleChain=RuleChain.outerRule(GrantPermissionRule.grant(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.POST_NOTIFICATIONS)).around(activity)
    private fun awaitState(expected:Boolean) {
        val deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(10)
        while(GoviewLocationService.running!=expected && System.nanoTime()<deadline)Thread.sleep(50)
        assertEquals(expected,GoviewLocationService.running)
    }
    @Test fun visibleOwnerStartContinuesBehindActivityAndNotificationStopClearsFix() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val context=instrumentation.targetContext
        assertFalse(GoviewLocationService.running)
        try {
            instrumentation.runOnMainSync {activity.activity.startForegroundService(Intent(activity.activity,GoviewLocationService::class.java).setAction(GoviewLocationService.START))}
            awaitState(true)
            instrumentation.runOnMainSync {activity.activity.moveTaskToBack(true)}
            Thread.sleep(300)
            assertTrue(GoviewLocationService.running)
            val notification=context.getSystemService(NotificationManager::class.java).activeNotifications.single {it.id==GoviewLocationService.NOTIFICATION}.notification
            assertTrue(notification.flags and android.app.Notification.FLAG_ONGOING_EVENT!=0)
            assertEquals(1,notification.actions.size)
            notification.actions.single().actionIntent.send()
            awaitState(false)
            assertNull(GoviewLocationService.currentFix())
        }finally{context.stopService(Intent(context,GoviewLocationService::class.java))}
    }
}
