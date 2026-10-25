package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class DirectConnectionTest {
    private val old="synthetic-old-device-credential"
    private val candidate="synthetic-new-device-credential"
    private class Disk(var token:String?, var blocked:Boolean=false)
    private fun connection(d:Disk, read:(String)->List<String>) = DirectConnection(
        load={d.token},save={d.token=it},revoke={d.token=null},
        suspended={d.blocked},suspendPolling={d.blocked=it},readPending=read)

    @Test fun validationDiscardsProposalsAndOnlyThenSaves() {
        val d=Disk(old);var calls=0
        val c=connection(d){assertEquals(old,d.token);calls++;listOf("must-not-apply")}
        val ticket=c.beginValidation()
        assertFalse(c.canPoll())
        assertTrue(c.validate(ticket,candidate))
        assertEquals(candidate,d.token);assertEquals(1,calls);assertTrue(c.canPoll())
        // validate returns only Boolean: there is no proposal/receipt dispatch callback.
    }
    @Test fun rejectedCandidatePreservesWorkingCredential() {
        val d=Disk(old);val c=connection(d){throw DirectHttpFailure(401)}
        assertThrows(DirectHttpFailure::class.java){c.validate(c.beginValidation(),candidate)}
        assertEquals(old,d.token);assertFalse(d.blocked);assertTrue(c.canPoll())
    }
    @Test fun failurePreservesPreviouslySuspendedState() {
        val d=Disk(old,true);val c=connection(d){throw DirectHttpFailure(403)}
        assertThrows(DirectHttpFailure::class.java){c.validate(c.beginValidation(),candidate)}
        assertEquals(old,d.token);assertTrue(d.blocked);assertFalse(c.canPoll())
    }
    @Test fun missingCredentialMakesNoRequest() {
        val c=connection(Disk(null)){error("unexpected network")}
        assertFalse(c.configured());assertFalse(c.canPoll())
        assertThrows(IllegalStateException::class.java){c.pending()}
    }
    @Test fun authFailureSurvivesNewClientAndResumeUntilExplicitValidation() {
        val d=Disk(old);var calls=0
        val c=connection(d){calls++;throw DirectHttpFailure(401)}
        assertThrows(DirectHttpFailure::class.java){c.pending()}
        c.cancel() // pause / resume does not clear rejection
        assertFalse(c.canPoll());assertEquals(old,d.token)
        val restored=connection(d){calls++;emptyList()}
        assertThrows(IllegalStateException::class.java){restored.pending()}
        assertEquals(1,calls)
        assertTrue(restored.validate(restored.beginValidation(),candidate))
        assertTrue(restored.canPoll());assertFalse(d.blocked)
    }
    @Test fun reconnectRestoresCommandReadAndReceiptTransport() {
        val d=Disk(old,true);var reads=0;var receipts=0
        val c=connection(d){ token ->
            assertEquals(candidate,token);reads++;listOf("synthetic-proposal")
        }
        assertThrows(IllegalStateException::class.java){c.pending()}
        assertTrue(c.validate(c.beginValidation(),candidate))
        assertEquals(1,reads);assertEquals(0,receipts)
        assertEquals(listOf("synthetic-proposal"),c.pending())
        // The owner-approved receipt path uses the same guarded request boundary.
        val result=c.request { token -> assertEquals(candidate,token);receipts++;"receipt-stored" }
        assertEquals("receipt-stored",result);assertEquals(2,reads);assertEquals(1,receipts)
    }
    @Test fun activationPersistenceFailureReportsSavedCredentialAndCanRecover() {
        val d=Disk(old,true);var failActivation=true
        val c=DirectConnection(load={d.token},save={d.token=it},revoke={d.token=null},
            suspended={d.blocked},suspendPolling={ value ->
                if(failActivation)throw IllegalStateException("synthetic storage error")
                d.blocked=value
            },readPending={ _:String -> listOf("synthetic-command") })
        val failure=assertThrows(DirectActivationIncomplete::class.java){
            c.validate(c.beginValidation(),candidate)
        }
        assertTrue(failure.credentialSaved);assertEquals(candidate,d.token)
        assertEquals("CREDENTIAL_SAVED_ACTIVATION_PENDING_RECONNECT",directSafeError(failure))
        assertTrue(c.blocked());assertFalse(c.canPoll())
        c.cancel();assertFalse(c.canPoll())
        failActivation=false
        assertTrue(c.validate(c.beginValidation(),candidate))
        assertEquals(listOf("synthetic-command"),c.pending());assertFalse(c.blocked())
    }
    @Test fun uncertainCredentialStoreFailureDoesNotClaimRejectionOrConnection() {
        val d=Disk(old)
        val c=DirectConnection(load={d.token},save={ _:String -> error("synthetic store failure")},
            revoke={d.token=null},suspended={d.blocked},suspendPolling={d.blocked=it},
            readPending={ _:String -> emptyList<String>() })
        val failure=assertThrows(DirectActivationIncomplete::class.java){c.validate(c.beginValidation(),candidate)}
        assertFalse(failure.credentialSaved);assertEquals(old,d.token);assertFalse(c.canPoll())
        assertEquals("CREDENTIAL_STORAGE_UNCERTAIN_RECONNECT",directSafeError(failure))
    }
    @Test fun failed401SuspensionWriteBlocksCurrentInstanceUntilOwnerReconnect() {
        val d=Disk(old)
        var calls=0
        val c=DirectConnection(
            load={d.token}, save={d.token=it}, revoke={d.token=null},
            suspended={d.blocked},
            suspendPolling={ paused ->
                if(paused)throw IllegalStateException("synthetic disk write failed")
                d.blocked=paused
            },
            readPending={ token:String ->
                calls++
                if(token==old)throw DirectHttpFailure(401)
                emptyList<String>()
            }
        )
        val error=assertThrows(DirectSuspensionIncomplete::class.java) { c.pending() }
        assertEquals("AUTH_REJECTED_PAUSE_NOT_PERSISTED_RECONNECT",directSafeError(error))
        assertFalse(d.blocked) // The durable write did not happen.
        assertTrue(c.blocked()) // This live instance fails closed regardless.
        assertFalse(c.canPoll())
        assertThrows(IllegalStateException::class.java) { c.pending() }
        assertEquals(1,calls) // Never retry rejected credentials silently.
        assertTrue(c.validate(c.beginValidation(),candidate))
        assertFalse(c.blocked())
        assertTrue(c.canPoll())
        assertEquals(2,calls) // Explicit validation is the only retry.
    }
    @Test fun temporaryFailureDoesNotPermanentlySuspend() {
        val d=Disk(old);val c=connection(d){throw DirectHttpFailure(503)}
        assertThrows(DirectHttpFailure::class.java){c.pending()}
        assertTrue(c.canPoll());assertFalse(d.blocked)
    }
    @Test fun cancelledOrSupersededValidationNeverStartsRequest() {
        val d=Disk(old);var calls=0;val c=connection(d){calls++;emptyList()}
        val first=c.beginValidation();c.cancel()
        assertFalse(c.validate(first,candidate));assertEquals(0,calls)
        val second=c.beginValidation();val third=c.beginValidation()
        assertFalse(c.validate(second,candidate));assertTrue(c.validate(third,candidate))
        assertEquals(1,calls)
    }
    @Test fun cancellationWhileReadPendingPreventsCredentialCommit() {
        val d=Disk(old);val entered=CountDownLatch(1);val release=CountDownLatch(1)
        val c=connection(d){entered.countDown();check(release.await(3,TimeUnit.SECONDS));emptyList()}
        val ticket=c.beginValidation();val result=AtomicReference<Boolean>()
        val thread=Thread{result.set(c.validate(ticket,candidate))};thread.start()
        try {assertTrue(entered.await(3,TimeUnit.SECONDS));c.cancel()}finally{release.countDown();thread.join(3000)}
        assertFalse(thread.isAlive);assertEquals(false,result.get());assertEquals(old,d.token)
    }
    @Test fun stale401CannotSuspendNewlyValidatedCredential() {
        val d=Disk(old);val entered=CountDownLatch(1);val release=CountDownLatch(1)
        val c=connection(d){ token ->
            if(token==old){entered.countDown();check(release.await(3,TimeUnit.SECONDS));throw DirectHttpFailure(401)}
            emptyList()
        }
        val failure=AtomicReference<Throwable>()
        val thread=Thread{try{c.pending()}catch(e:Throwable){failure.set(e)}};thread.start()
        try {assertTrue(entered.await(3,TimeUnit.SECONDS));assertTrue(c.validate(c.beginValidation(),candidate))}
        finally{release.countDown();thread.join(3000)}
        assertTrue(failure.get() is DirectHttpFailure);assertFalse(d.blocked);assertEquals(candidate,d.token)
    }
    @Test fun oldReadCannotDeliverCommandsAfterCancel() {
        val d=Disk(old);lateinit var c:DirectConnection<List<String>>
        c=connection(d){c.cancel();listOf("stale-command")}
        assertThrows(IllegalStateException::class.java){c.pending()}
    }
    @Test fun disconnectDuringValidationCannotRestoreCredential() {
        val d=Disk(old);lateinit var c:DirectConnection<List<String>>
        c=connection(d){c.disconnect();emptyList()}
        assertFalse(c.validate(c.beginValidation(),candidate));assertNull(d.token)
    }
    @Test fun invalidCandidateAndErrorsAreRedacted() {
        val d=Disk(old);val c=connection(d){error("unexpected network")}
        assertThrows(IllegalArgumentException::class.java){c.validate(c.beginValidation(),"invalid")}
        assertEquals(old,d.token)
        assertEquals("CONNECTION_CHECK_FAILED",directSafeError(Exception("sensitive-body")))
        assertEquals("AUTH_REJECTED_RECONNECT_REQUIRED",directSafeError(DirectHttpFailure(401)))
        assertEquals("DEVICE_ROLE_REQUIRED",directSafeError(DirectHttpFailure(403)))
    }
}
