package com.big.gobrowser.outsideview

import org.json.JSONObject
import java.security.MessageDigest

/** Independent upload-receipt expectation, not merely the download server's own headers. */
object GoviewArtifact {
    fun verify(bytes: ByteArray, mapId: String, version: Int, uploadSha256: String) {
        require(bytes.size <= 1024 * 1024 + 256) { "PACKAGE_TOO_LARGE" }
        require(Regex("[a-f0-9]{64}").matches(uploadSha256)) { "EXPECTED_DIGEST_REQUIRED" }
        val map = JSONObject(String(bytes, Charsets.UTF_8)).getJSONObject("map")
        require(map.getString("mapId") == mapId) { "EXPECTED_IDENTITY_MISMATCH" }
        require(map.getInt("version") == version) { "EXPECTED_VERSION_MISMATCH" }
        val actual = MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { "%02x".format(it.toInt() and 255) }
        require(actual == uploadSha256) { "EXPECTED_UPLOAD_DIGEST_MISMATCH" }
    }
}
