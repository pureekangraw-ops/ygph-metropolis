package com.big.gobrowser.update
import org.junit.Assert.*
import org.junit.Test
class UpdatePolicyTest {
    private val sha="a".repeat(64)
    private val signer="b".repeat(64)
    private val update=AppUpdate("com.big.gobrowser",18,"https://yggmetro.com/update.apk",sha,signer,"c".repeat(40))
    @Test fun matchingNewerApkAccepts() { update.verify(update.packageName,17,setOf(signer),update.packageName,18,setOf(signer),sha) }
    @Test fun wrongSignerPackageVersionOrBytesReject() {
        val cases=listOf<() -> Unit>(
            { update.verify(update.packageName,18,setOf(signer),update.packageName,18,setOf(signer),sha) },
            { update.verify(update.packageName,17,setOf(signer),"other.package",18,setOf(signer),sha) },
            { update.verify(update.packageName,17,setOf(signer),update.packageName,19,setOf(signer),sha) },
            { update.verify(update.packageName,17,setOf(signer),update.packageName,18,setOf(sha),sha) },
            { update.verify(update.packageName,17,setOf(signer),update.packageName,18,setOf(signer),signer) })
        cases.forEach { assertTrue(runCatching(it).exceptionOrNull() is IllegalArgumentException) }
    }
    @Test fun candidate20AdvancesKnownVersionsWithoutBypassingEqualOrNewerCheck() {
        val candidate=update.copy(versionCode=20)
        for(installed in listOf(17L,18L,19L))
            candidate.verify(candidate.packageName,installed,setOf(signer),candidate.packageName,20,setOf(signer),sha)
        for(installed in listOf(20L,21L))
            assertTrue(runCatching {
                candidate.verify(candidate.packageName,installed,setOf(signer),candidate.packageName,20,setOf(signer),sha)
            }.exceptionOrNull() is IllegalArgumentException)
    }
    @Test fun credentialsAndUntrustedUrlsReject() {
        listOf("http://yggmetro.com/a", "https://evil.com/a", "https://yggmetro.com.evil.com/a", "https://user:secret@yggmetro.com/a", "https://yggmetro.com/a?token=secret").forEach {
            assertTrue(runCatching { AppUpdate.trustedUrl(it) }.isFailure)
        }
    }
}
