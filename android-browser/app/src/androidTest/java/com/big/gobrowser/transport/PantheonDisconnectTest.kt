package com.big.gobrowser.transport

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class PantheonDisconnectTest {
    private val context get()=InstrumentationRegistry.getInstrumentation().targetContext
    private fun credentials()=AndroidDeviceCredentialStore(context,"pantheon-observatory-key","pantheon-observatory-device")

    @Test fun offlineDisconnectRemovesCredentialsBeforeWaitingForServer() {
        val token="a".repeat(64)
        val identity=context.getSharedPreferences("pantheon-observatory-identity",0)
        credentials().save(token);identity.edit().putString("deviceId","obs_"+"b".repeat(32)).commit()
        val finished=CountDownLatch(1)
        val client=PantheonObservatoryClient(context){_,_,sent->
            assertEquals(token,sent)
            assertNull(credentials().load())
            assertFalse(identity.contains("deviceId"))
            throw IOException("offline")
        }
        try {
            client.disconnect {assertTrue(it.isFailure);finished.countDown()}
            assertFalse(client.isPaired())
            assertNull(client.deviceId())
            assertNull(credentials().load())
            assertFalse(identity.contains("deviceId"))
            assertTrue(finished.await(5,TimeUnit.SECONDS))
            assertFalse(PantheonObservatoryClient(context).also {it.close()}.isPaired())
        } finally {client.close();credentials().revoke();identity.edit().clear().commit()}
    }

    @Test fun disconnectCancelsAnAlreadyInFlightPairingResponse() {
        val entered=CountDownLatch(1);val release=CountDownLatch(1);val paired=CountDownLatch(1);val disconnected=CountDownLatch(1)
        val client=PantheonObservatoryClient(context){url,_,_->
            if(url.endsWith("/pair")){
                entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS))
                """{"scope":"observatory:observe-only","deviceToken":"${"c".repeat(64)}","deviceId":"obs_${"d".repeat(32)}"}"""
            }else "{}"
        }
        try {
            credentials().revoke()
            client.pair("owner".repeat(8)){assertTrue(it.isFailure);paired.countDown()}
            assertTrue(entered.await(5,TimeUnit.SECONDS))
            client.disconnect {disconnected.countDown()}
            release.countDown()
            assertTrue(paired.await(5,TimeUnit.SECONDS))
            assertTrue(disconnected.await(5,TimeUnit.SECONDS))
            assertFalse(client.isPaired())
        }finally{release.countDown();client.close();credentials().revoke()}
    }
}
