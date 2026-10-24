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
    @Synchronized fun configured() = !load().isNullOrBlank()
    @Synchronized fun blocked() = suspended()
    @Synchronized fun canPoll() = configured() && !suspended() && !validating
    @Synchronized fun beginValidation(): Long { validating = true; return ++generation }
    @Synchronized fun cancel() { generation++; validating = false }
    @Synchronized fun disconnect() { cancel(); revoke(); suspendPolling(false) }

    // Discard the result: validation must never dispatch a proposal or send a receipt.
    fun validate(ticket: Long, candidate: String): Boolean {
        try {
            synchronized(this) { if (ticket != generation || !validating) return false }
            require(candidate.length in 20..512 && candidate.all { it > ' ' && it < '\u007f' })
            readPending(candidate)
            synchronized(this) {
                if (ticket != generation || !validating) return false
                save(candidate)
                suspendPolling(false)
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
            generation to (load() ?: error("DIRECT_CONNECTION_NOT_CONFIGURED"))
        }
        try {
            val result = action(snapshot.second)
            synchronized(this) { check(snapshot.first == generation) { "DIRECT_REQUEST_CANCELLED" } }
            return result
        } catch (e: Exception) {
            synchronized(this) {
                if (snapshot.first == generation && e is DirectHttpFailure && e.status == 401) {
                    suspendPolling(true)
                }
            }
            throw e
        }
    }
    fun pending(): T = request(readPending)
}

/** Only this fixed status crosses into UI; never response bodies, URLs or exception messages. */
class DirectHttpFailure(val status: Int) : Exception("DIRECT_HTTP_$status")
fun directSafeError(error: Throwable): String = when {
    error is DirectHttpFailure && error.status == 401 -> "AUTH_REJECTED_RECONNECT_REQUIRED"
    error is DirectHttpFailure && error.status == 403 -> "DEVICE_ROLE_REQUIRED"
    error is DirectHttpFailure && error.status == 503 -> "SERVICE_UNAVAILABLE"
    error is DirectHttpFailure -> "HTTP_FAILURE"
    error is IllegalArgumentException -> "INVALID_CONNECTION_OR_RESPONSE"
    else -> "CONNECTION_CHECK_FAILED"
}
