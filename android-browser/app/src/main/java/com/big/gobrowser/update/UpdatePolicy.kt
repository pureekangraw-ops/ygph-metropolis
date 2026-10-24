package com.big.gobrowser.update

import org.json.JSONObject
import java.net.URI

/** An update manifest is metadata, never authority to change package or signer. */
data class AppUpdate(val packageName: String, val versionCode: Long, val url: String,
    val sha256: String, val signerSha256: String, val sourceCommit: String) {
    companion object {
        fun parse(raw: String): AppUpdate {
            val j = JSONObject(raw)
            require(j.getInt("schema") == 1)
            val result = AppUpdate(j.getString("packageName"), j.getLong("versionCode"),
                j.getString("url"), j.getString("sha256"), j.getString("signerSha256"), j.getString("sourceCommit"))
            require(result.versionCode > 0)
            require(Regex("[a-f0-9]{64}").matches(result.sha256))
            require(Regex("[a-f0-9]{64}").matches(result.signerSha256))
            require(Regex("[a-f0-9]{40}").matches(result.sourceCommit))
            trustedUrl(result.url)
            return result
        }
        fun trustedUrl(value: String): String {
            val u = URI(value)
            val host = u.host?.lowercase().orEmpty()
            require(u.scheme == "https" && u.userInfo == null && u.port == -1 && u.fragment == null && u.query == null)
            require(host == "github.com" || host == "raw.githubusercontent.com" ||
                host == "yggmetro.com" || host.endsWith(".yggmetro.com"))
            return value
        }
    }
    fun verify(installedPackage: String, installedVersion: Long, installedSigners: Set<String>,
        archivePackage: String, archiveVersion: Long, archiveSigners: Set<String>, actualDigest: String) {
        require(packageName == installedPackage && archivePackage == installedPackage) { "PACKAGE_MISMATCH" }
        require(versionCode > installedVersion && archiveVersion == versionCode) { "VERSION_MISMATCH" }
        require(installedSigners.isNotEmpty() && archiveSigners == installedSigners &&
            archiveSigners == setOf(signerSha256)) { "SIGNER_MISMATCH" }
        require(sha256 == actualDigest) { "APK_DIGEST_MISMATCH" }
    }
}
