package com.big.gobrowser.update

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.*
import androidx.core.content.FileProvider
import com.big.gobrowser.BuildConfig
import com.big.gobrowser.ui.ObservatoryBuildStamp
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Owner initiated diagnostics and updates. No background downloads, telemetry or data deletion. */
class AppMaintenanceActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var manifestUrl: EditText
    private var candidate: AppUpdate? = null
    private var verifiedApk: File? = null
    private var busy = false
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(45, TimeUnit.SECONDS).build()
    private val prefs by lazy { getSharedPreferences("observatory-maintenance", MODE_PRIVATE) }
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(20,20,20,20) }
        status = TextView(this).apply { text = diagnostics(); setTextIsSelectable(true) }
        content.addView(status)
        fun button(label: String, action: () -> Unit) { content.addView(Button(this).apply { text=label; setOnClickListener { action() } }) }
        button("Refresh diagnostics") { status.text = diagnostics() }
        button("Copy displayed diagnostics") {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Observatory diagnostics", status.text))
        }
        manifestUrl = EditText(this).apply {
            hint="HTTPS update manifest URL"; setSingleLine(); setText(prefs.getString("manifest", ""))
        }
        content.addView(manifestUrl)
        button("Check update") { checkUpdate() }
        button("Download and verify APK") { download() }
        button("Install verified update…") { consentInstall() }
        button("Close") { finish() }
        setContentView(ScrollView(this).apply { addView(content) })
    }
    @Suppress("DEPRECATION")
    private fun ownInfo() = packageManager.getPackageInfo(packageName,
        if(Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)
    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> =
        (if(Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures)
            ?.map { digest(it.toByteArray()) }?.toSet().orEmpty()
    @Suppress("DEPRECATION")
    private fun version(info: PackageInfo): Long = if(Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun diagnostics(): String {
        val remote = getSharedPreferences("observatory-remote-ui", MODE_PRIVATE)
        val endpoint = runCatching { Uri.parse(remote.getString("service", "")).host }.getOrNull() ?: "not configured"
        val maps = File(filesDir,"goview-studio-maps").listFiles()?.filter { it.name.endsWith(".goview.json") }
            ?.mapNotNull { f -> runCatching { JSONObject(f.readText()).getJSONObject("map").let {
                "schema ${it.getInt("schema")} / data v${it.getInt("version")}" } }.getOrNull() }.orEmpty()
        return ObservatoryBuildStamp.detail() + "\nPackage: $packageName\nSigner SHA-256: " + signers(ownInfo()).joinToString(", ") +
            "\nMap packages: ${maps.size}\n" + maps.joinToString("\n") +
            "\nBrowser endpoint: $endpoint\nLast endpoint check: " + remote.getString("diagnostic-status", "not checked") +
            "\nCorrelation ID: " + remote.getString("diagnostic-id", "none") +
            "\nLast update check: " + prefs.getString("result", "not checked") +
            "\nUpdate correlation ID: " + prefs.getString("correlation", "none")
    }
    private fun work(action: () -> String) {
        if(busy) return
        busy = true
        val id = UUID.randomUUID().toString()
        status.text="Working · $id"
        Thread {
            val result=runCatching(action)
            // Deliberately do not print server bodies, URLs, secrets or arbitrary exception messages.
            val text=result.getOrElse { "UPDATE_FAILED · check manifest, network, package, version, hash and signer" }
            prefs.edit().putString("result",text).putString("correlation",id).apply()
            runOnUiThread { busy=false; if(!isDestroyed && !isFinishing) status.text=text+"\nCorrelation: $id" }
        }.start()
    }
    private fun fetch(url: String, target: File?, limit: Long): ByteArray {
        var next = AppUpdate.trustedUrl(url)
        var response = client.newCall(Request.Builder().url(next).build()).execute()
        var redirects = 0
        while (response.code in listOf(301,302,303,307,308)) {
            val location = response.header("Location")
            response.close()
            check(++redirects <= 3 && location != null) { "REDIRECT_REJECTED" }
            val redirected = java.net.URI(next).resolve(location)
            val host = redirected.host?.lowercase()
            check(redirected.scheme == "https" && redirected.userInfo == null && redirected.port == -1 &&
                redirected.fragment == null && host in setOf("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")) { "REDIRECT_REJECTED" }
            next = redirected.toString()
            response = client.newCall(Request.Builder().url(next).build()).execute()
        }
        response.use {
            check(response.isSuccessful) { "HTTP_FAILED" }
            val body=response.body ?: error("EMPTY_BODY")
            check(body.contentLength() <= limit)
            val buffer=java.io.ByteArrayOutputStream()
            val output=target?.outputStream() ?: buffer
            output.use { out -> body.byteStream().use { input ->
                val chunk=ByteArray(8192); var total=0L
                while(true) { val n=input.read(chunk); if(n<0) break; total+=n; check(total<=limit); out.write(chunk,0,n) }
            } }
            return buffer.toByteArray()
        }
    }
    private fun checkUpdate() {
        if(busy) return
        val url=manifestUrl.text.toString().trim()
        candidate=null; verifiedApk=null
        work {
            val update=AppUpdate.parse(String(fetch(url,null,65536),Charsets.UTF_8))
            check(update.packageName == packageName && update.signerSha256 in signers(ownInfo()))
            check(update.versionCode > version(ownInfo()))
            candidate=update; prefs.edit().putString("manifest",url).apply()
            "Update available · version ${update.versionCode}\nSource: ${update.sourceCommit}\nSHA-256: ${update.sha256}\nTap Download to verify."
        }
    }
    private fun verify(file: File, update: AppUpdate) {
        @Suppress("DEPRECATION")
        val archive=packageManager.getPackageArchiveInfo(file.path,
            if(Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)
            ?: error("INVALID_APK")
        val sha=MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input -> val chunk=ByteArray(8192); while(true) { val n=input.read(chunk); if(n<0)break; sha.update(chunk,0,n) } }
        val installed=ownInfo()
        update.verify(packageName,version(installed),signers(installed),archive.packageName,version(archive),signers(archive),
            sha.digest().joinToString("") { "%02x".format(it.toInt() and 255) })
    }
    private fun download() {
        if(busy) return
        val update=candidate ?: return
        verifiedApk=null
        work {
            val file=File(File(cacheDir,"observatory_updates").apply { mkdirs() },"verified-update.apk")
            try { fetch(update.url,file,150L*1024*1024); verify(file,update); verifiedApk=file }
            catch(t: Exception) { file.delete(); throw t }
            "APK verified · version ${update.versionCode}\nSHA-256: ${update.sha256}\nInstaller will require your consent."
        }
    }
    private fun consentInstall() {
        if(busy) return
        val file=verifiedApk ?: return
        val update=candidate ?: return
        AlertDialog.Builder(this).setTitle("Install update ${update.versionCode}?")
            .setMessage("Android will ask you to install this verified update. Existing app data is kept. No uninstall or data clearing is performed.")
            .setPositiveButton("Open Android installer") { _, _ ->
                if(Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
                    startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:$packageName")))
                    status.text="After granting installer access, tap Install again."
                } else {
                    work {
                        verify(file,update)
                        runOnUiThread { if(!isDestroyed) {
                            val uri=FileProvider.getUriForFile(this,"$packageName.fileprovider",file)
                            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive")
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                        } }
                        "Installer handoff requested · installation outcome not yet verified"
                    }
                }
            }.setNegativeButton("Cancel",null).show()
    }
}
