package com.big.gobrowser.transport

/** Safe diagnostic booleans only; never stores or renders pairing values or credentials. */
data class ObservatoryPairingReadback(
    val commitSucceeded: Boolean,
    val credentialExactReadback: Boolean,
    val recordPresent: Boolean,
    val workMatches: Boolean,
    val deviceMatches: Boolean,
    val endpointMatches: Boolean,
    val storageError: Boolean,
) {
    val passed: Boolean
        get() = commitSucceeded && credentialExactReadback && recordPresent
            && workMatches && deviceMatches && endpointMatches && !storageError

    /** Compact flags are safe to show in app diagnostics; no IDs, URLs, or tokens are included. */
    fun safeSummary(): String = "RD[C${bit(commitSucceeded)} X${bit(credentialExactReadback)} P${bit(recordPresent)} W${bit(workMatches)} D${bit(deviceMatches)} E${bit(endpointMatches)} S${bit(storageError)}]"

    companion object {
        fun compare(
            expected: MetropolisMcpClient.ObservatoryPair,
            saved: MetropolisMcpClient.ObservatoryPair?,
            credential: CredentialSaveReadback,
            storageError: Boolean,
        ) = ObservatoryPairingReadback(
            commitSucceeded = credential.commitSucceeded,
            credentialExactReadback = credential.exactReadback,
            recordPresent = saved != null,
            workMatches = saved?.workId == expected.workId,
            deviceMatches = saved?.deviceId == expected.deviceId,
            endpointMatches = saved?.publishSnapshot == expected.publishSnapshot,
            storageError = storageError,
        )

        private fun bit(value: Boolean) = if (value) "1" else "0"
    }
}
