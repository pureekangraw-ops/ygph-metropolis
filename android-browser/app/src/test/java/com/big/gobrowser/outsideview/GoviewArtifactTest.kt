package com.big.gobrowser.outsideview
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest
class GoviewArtifactTest {
    private val bytes="""{"map":{"mapId":"map_b","version":5}}""".toByteArray()
    private val sha=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    @Test fun exactUploadedBytesAccept() { GoviewArtifact.verify(bytes,"map_b",5,sha) }
    @Test fun selfConsistentDownloadCannotSubstituteForExpectedArtifact() {
        listOf<() -> Unit>(
            { GoviewArtifact.verify(bytes,"map_a",5,sha) },
            { GoviewArtifact.verify(bytes,"map_b",2,sha) },
            { GoviewArtifact.verify(bytes,"map_b",5,"0".repeat(64)) },
            { GoviewArtifact.verify(bytes + byteArrayOf(32),"map_b",5,sha) }
        ).forEach { assertTrue(runCatching(it).exceptionOrNull() is IllegalArgumentException) }
    }
}
