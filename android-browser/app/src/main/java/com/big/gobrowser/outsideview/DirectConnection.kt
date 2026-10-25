package com.big.gobrowser.outsideview

/** No Android or network dependency: serializes credential changes against stale responses. */
class DirectConnection<T>(
    private val load: () -> String?,
    private val save: (String) -> Unit,
    private val revoke: () -> Unit,
    private val suspended: () -> Boolean,
    private val suspendPolling: (Boolean) -> Unit,
    private val readPending: (String) -> T
) {
    private var generation = 0L
    private var validating = false
    private var activationIncomplete = false
    @Synchronized fun configured() = !load().isNullOrBlank()
    @Synchronized fun blocked() = activationIncomplete || suspended()
    @Synchronized fun canPoll() = configured() && !blocked() && !validating
    @Synchronized fun validationInProgress() = validating
    @Synchronized fun beginValidation(): Long { validating = true; return ++generation }
    @Synchronized fun cancel() { generation++; validating = false }
    @Synchronized fun disconnect() { cancel(); revoke(); suspendPolling(false); activationIncomplete = false }

    // Discard the result: validation must never dispatch a proposal or send a receipt.
    fun validate(ticket: Long, candidate: String): Boolean {
        try {
            synchronized(this) { if (ticket != generation || !validating) return false }
            require(candidate.length in 20..512 && candidate.all { it > ' ' && it < '\u007f' })
            synchronized(this) {
                if (ticket != generation || !validating) return false
                // Rechecking the saved token can reject the very credential polling
                // would reuse. Arm before validation too; a different candidate must
                // not suspend the unrelated working credential on rejection.
                if (candidate == load()) {
                    activationIncomplete = true
                    try { suspendPolling(true) }
                    catch (_: Exception) { throw DirectRequestPersistenceFailure() }
                }
            }
            readPending(candidate)
            synchronized(this) {
                if (ticket != generation || !validating) return false
                // These are two durable stores, not an atomic transaction. Never report
                // a credential rejection after a verified replacement has been saved.
                activationIncomplete = true
                try { suspendPolling(true); save(candidate) }
                catch (_: Exception) { throw DirectActivationIncomplete(false) }
                try { suspendPolling(false) }
                catch (_: Exception) { throw DirectActivationIncomplete(true) }
                activationIncomplete = false
                validating = false
                return true
            }
        } catch (e: Exception) {
            synchronized(this) {
                if (ticket != generation) return false
                validating = false
            }
            throw e
        }
    }

    fun <R> request(action: (String) -> R): R {
        val snapshot = synchronized(this) {
            check(canPoll()) { "DIRECT_RECONNECT_REQUIRED" }
            val token = load() ?: error("DIRECT_CONNECTION_NOT_CONFIGURED")
            // Write ahead: a killed process or a failed write after a 401 must
            // never revive the old credential. No network dispatch before commit.
            activationIncomplete = true
            try { suspendPolling(true) }
            catch (_: Exception) { throw DirectRequestPersistenceFailure() }
            generation to token
        }
        try {
            val result = action(snapshot.second)
            synchronized(this) {
                check(snapshot.first == generation) { "DIRECT_REQUEST_CANCELLED" }
                finishRequest()
            }
            return result
        } catch (e: Exception) {
            synchronized(this) {
                if (snapshot.first == generation && e !is DirectRequestPersistenceFailure &&
                    !(e is DirectHttpFailure && e.status == 401)) {
                    // A completed non-auth failure may retry, but only after the
                    // durable guard is cleared. Stale responses cannot clear it.
                    finishRequest()
                }
            }
            throw e
        }
    }
    private fun finishRequest() {
        try { suspendPolling(false) }
        catch (_: Exception) { throw DirectRequestPersistenceFailure() }
        activationIncomplete = false
    }

    fun pending(): T = request(readPending)
}

/** Only this fixed status crosses into UI; never response bodies, URLs or exception messages. */
/** Saved=true means credential commit succeeded but activation persistence did not.
 * Saved=false means the credential store outcome is uncertain. No secret is retained here.
 * Both require explicit revalidation; the guard is committed before credential changes.
 */
class DirectActivationIncomplete(val credentialSaved: Boolean) : Exception("DIRECT_ACTIVATION_INCOMPLETE")
class DirectRequestPersistenceFailure : Exception("DIRECT_REQUEST_PERSISTENCE_UNCERTAIN")
class DirectHttpFailure(val status: Int) : Exception("DIRECT_HTTP_$status")
fun directSafeError(error: Throwable): String = when {
    error is DirectRequestPersistenceFailure -> "REQUEST_STORAGE_UNCERTAIN_RECONNECT"
    error is DirectActivationIncomplete && error.credentialSaved -> "CREDENTIAL_SAVED_ACTIVATION_PENDING_RECONNECT"
    error is DirectActivationIncomplete -> "CREDENTIAL_STORAGE_UNCERTAIN_RECONNECT"
    error is DirectHttpFailure && error.status == 401 -> "AUTH_REJECTED_RECONNECT_REQUIRED"
    error is DirectHttpFailure && error.status == 403 -> "DEVICE_ROLE_REQUIRED"
    error is DirectHttpFailure && error.status == 503 -> "SERVICE_UNAVAILABLE"
    error is DirectHttpFailure -> "HTTP_FAILURE"
    error is IllegalArgumentException -> "INVALID_CONNECTION_OR_RESPONSE"
    else -> "CONNECTION_CHECK_FAILED"
}
