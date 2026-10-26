package com.big.gobrowser.browser

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors

class BrowserRequestEpochTest {
    @Test fun ownerSafetyRunsWhileOrdinaryRequestWaitsAndDropsItsLateRender() {
        val epochs=BrowserRequestEpoch()
        val ordinary=Executors.newSingleThreadExecutor()
        val safety=Executors.newSingleThreadExecutor()
        val waiting=CountDownLatch(1)
        val release=CountDownLatch(1)
        val ownerDone=CountDownLatch(1)
        val rendered=java.util.concurrent.CopyOnWriteArrayList<String>()
        val old=epochs.begin(false)
        try {
            val prior=ordinary.submit {
                waiting.countDown()
                check(release.await(5,TimeUnit.SECONDS))
                if(epochs.current(old))rendered.add("GO")
            }
            assertTrue(waiting.await(5,TimeUnit.SECONDS))
            val takeover=epochs.begin(true)
            safety.submit {if(epochs.current(takeover))rendered.add("BIG");ownerDone.countDown()}
            assertTrue("owner safety must not await ordinary network completion",ownerDone.await(5,TimeUnit.SECONDS))
            release.countDown();prior.get(5,TimeUnit.SECONDS)
            assertEquals(listOf("BIG"),rendered)
            assertFalse("queued pre-revoke command is invalid",epochs.current(old))
            assertTrue(epochs.current(epochs.begin(false)))
        } finally {release.countDown();ordinary.shutdownNow();safety.shutdownNow()}
    }

    @Test fun newerSafetyDecisionInvalidatesOlderSafetyReadback() {
        val epochs=BrowserRequestEpoch()
        val stop=epochs.begin(true)
        val close=epochs.begin(true)
        assertFalse(epochs.current(stop))
        assertTrue(epochs.current(close))
    }
    @Test fun closeBusyRefreshesRevokedControlWithoutRetryingUnauthorizedFailures() {
        val epochs=BrowserRequestEpoch()
        assertTrue(epochs.needsReadback(true,"/v1/close",false,409))
        assertTrue(epochs.needsReadback(true,"/v1/stop",true,200))
        for(status in listOf(401,403,404,500))
            assertFalse("failure $status must not issue another authenticated request",epochs.needsReadback(true,"/v1/close",false,status))
        assertFalse(epochs.needsReadback(true,"/v1/control",false,409))
        assertFalse(epochs.needsReadback(false,"/v1/close",false,409))
        assertFalse(epochs.needsReadback(false,"/v1/session",true,200))
    }

}
