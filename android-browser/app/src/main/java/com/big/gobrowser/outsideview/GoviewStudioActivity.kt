package com.big.gobrowser.outsideview

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Bundle
import android.os.SystemClock
import android.util.AtomicFile
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URI
import java.util.concurrent.TimeUnit

/**
 * Offline GO Map Studio. The WebView loads ONLY bundled, trusted application assets.
 * Files are separate from legacy MapStateStore/SQLite: it cannot overwrite owner pins.
 * A downloaded package is never auto-committed; the embedded UI previews a diff first.
 */
class GoviewStudioActivity : Activity() {
    private lateinit var web: WebView
    private val legacyStorage by lazy { AtomicFile(File(filesDir, "goview-studio-map-v1.json")) }
    private val mapDirectory by lazy { File(filesDir, "goview-studio-maps").apply { mkdirs() } }
    private val preferences by lazy { getSharedPreferences("goview-studio-map-library", MODE_PRIVATE) }
    private val mapIdPattern = Regex("[a-zA-Z0-9_-]{1,70}")
    private fun mapStorage(id: String): AtomicFile {
        require(mapIdPattern.matches(id))
        return AtomicFile(File(mapDirectory, "${id}.goview.json"))
    }
    private fun activeStorage(): AtomicFile {
        val id = preferences.getString("activeMap", null)
        return if (id != null && mapIdPattern.matches(id)) mapStorage(id) else legacyStorage
    }
    // All Activity instances coordinate read/modify/write, including rotation.
    companion object { private val storageLock = Any() }
    private val transferDirectory by lazy { File(filesDir, "goview-transfers").apply { mkdirs() } }
    private var pendingExport: ByteArray? = null
    private var webReady = false
    private var pendingIncoming: Intent? = null
    private val assetRoot = "file:///android_asset/goview-studio/"
    private val maxSize = 1024 * 1024 + 256

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingIncoming = intent
        val host = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        host.addView(TextView(this).apply {
            text = "GOVIEW · GO Map Studio · แผนที่วาดในเครื่อง"
            textSize = 14f
            setPadding(18, 10, 18, 10)
        })
        host.addView(com.big.gobrowser.ui.ObservatoryBuildStamp.view(this))
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            settings.allowFileAccess = true
            settings.allowContentAccess = false
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.blockNetworkLoads = true
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    if (url == assetRoot + "index.html") {
                        webReady = true
                        consumeIncoming()
                    }
                }
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return request?.url?.toString() != assetRoot + "index.html"
                }
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                    val uri = request?.url?.toString() ?: return forbidden()
                    if (uri != assetRoot + "index.html" && uri != assetRoot + "engine.js") return forbidden()
                    return null
                }
            }
            addJavascriptInterface(Bridge(), "GoviewHost")
        }
        host.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        // Android 15/16 edge-to-edge can place this native header under status-bar icons.
        // Reuse the same native safe-area handling as the main Observatory Browser.
        com.big.gobrowser.ui.PhoneLayout.fitSystemBars(host)
        setContentView(host)
        web.loadUrl(assetRoot + "index.html")
    }

    /** Shared file enters approval preview, never the active map automatically. */
    private fun consumeIncoming() {
        if (!webReady) return
        val shared = pendingIncoming ?: return
        pendingIncoming = null
        if (shared.action != Intent.ACTION_SEND && shared.action != Intent.ACTION_VIEW) return
        @Suppress("DEPRECATION")
        val uri = if (shared.action == Intent.ACTION_SEND) {
            shared.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM)
        } else shared.data
        val text = if (uri == null) shared.getStringExtra(Intent.EXTRA_TEXT) else null
        Thread {
            val result = runCatching {
                val bytes = if (uri != null) {
                    contentResolver.openInputStream(uri)?.use { readLimited(it) } ?: error("Unreadable shared file")
                } else {
                    (text ?: error("No file attached")).toByteArray(StandardCharsets.UTF_8)
                        .also { require(it.size <= maxSize) }
                }
                String(bytes, StandardCharsets.UTF_8)
            }
            result.onSuccess { callback("receiveImport", it) }
                .onFailure { callback("nativeStatus", "อ่านไฟล์แชร์ไม่ได้หรือขนาดเกิน 1 MiB") }
        }.start()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingIncoming = intent
        consumeIncoming()
    }

    private fun forbidden() = WebResourceResponse("text/plain", "utf-8",
        ByteArrayInputStream("Blocked by GOVIEW offline asset policy".toByteArray(StandardCharsets.UTF_8)))

    private fun callback(method: String, vararg args: Any?) {
        val serialized = args.joinToString(",") { value ->
            when (value) {
                null -> "null"
                is String -> JSONObject.quote(value)
                is Number -> value.toString()
                else -> "null"
            }
        }
        runOnUiThread {
            if (::web.isInitialized && !isFinishing && !isDestroyed) {
                web.evaluateJavascript("window.GoviewStudio && window.GoviewStudio.$method($serialized)", null)
            }
        }
    }

    /** Secondary check independent of JS to avoid blindly persisting malformed app-origin data. */
    private fun validPackage(text: String): Boolean {
        if (text.toByteArray(StandardCharsets.UTF_8).size > maxSize) return false
        return runCatching {
            val envelope = JSONObject(text)
            require(envelope.getString("format") == "goview.map.package.v1")
            require(Regex("sha256:[a-f0-9]{64}").matches(envelope.getString("checksum")))
            val map = envelope.getJSONObject("map")
            require(map.getInt("schema") == 1 && map.getInt("version") in 1..1000000)
            require(Regex("[a-zA-Z0-9_-]{1,70}").matches(map.getString("mapId")))
            require(map.getString("title").length in 1..140)
            val origin = map.getJSONObject("origin")
            require(origin.getDouble("lat") in -90.0..90.0 && origin.getDouble("lng") in -180.0..180.0)
            val nodes = map.getJSONArray("nodes")
            val roads = map.getJSONArray("roads")
            val areas = map.getJSONArray("areas")
            val pois = map.getJSONArray("pois")
            require(nodes.length() <= 2000 && roads.length() <= 4000 && areas.length() <= 200 && pois.length() <= 1000)
            val ids = mutableSetOf<String>()
            repeat(nodes.length()) { i ->
                val node = nodes.getJSONObject(i)
                val id = node.getString("id")
                require(Regex("[a-zA-Z0-9_-]{1,60}").matches(id) && ids.add(id))
                require(node.getDouble("x") in -2000000.0..2000000.0 &&
                    node.getDouble("y") in -2000000.0..2000000.0)
            }
            repeat(roads.length()) { i ->
                val road = roads.getJSONObject(i)
                require(ids.contains(road.getString("from")) && ids.contains(road.getString("to")))
                require(road.getString("from") != road.getString("to"))
            }
            repeat(pois.length()) { i -> require(ids.contains(pois.getJSONObject(i).getString("nodeId"))) }
            true
        }.getOrDefault(false)
    }

    private inner class Bridge {
        @JavascriptInterface fun readState() {
            val raw = synchronized(storageLock) {
                runCatching { activeStorage().openRead().use { input ->
                    val bytes = readLimited(input)
                    String(bytes, StandardCharsets.UTF_8)
                } }.getOrNull()
            }
            if (raw != null) callback("receiveNativePackage", raw)
        }

        @JavascriptInterface fun prepareImport(text: String) {
            val result = synchronized(storageLock) { runCatching {
                check(validPackage(text))
                val id = JSONObject(text).getJSONObject("map").getString("mapId")
                val destination = mapStorage(id)
                if (destination.baseFile.exists() || File(destination.baseFile.path + ".bak").exists())
                    destination.openRead().use { String(readLimited(it), StandardCharsets.UTF_8) } else null
            } }
            result.onSuccess { callback("receiveImportPreview", text, it) }
                .onFailure { callback("nativeStatus", "Preview อ่านแผนที่เดิมไม่ได้ · ไม่เปลี่ยนข้อมูล") }
        }

        @JavascriptInterface fun savePackage(text: String) { save(text, null) }
        @JavascriptInterface fun saveApprovedPackage(text: String, expectedBase: String) { save(text, expectedBase) }
        private fun save(text: String, expectedBase: String?) {
            if (!validPackage(text)) {
                callback("nativeStatus", "ไม่บันทึก: โครงสร้างแพ็กเกจผิดหรือเกินขนาด")
                return
            }
            val bytes = text.toByteArray(StandardCharsets.UTF_8)
            val id = JSONObject(text).getJSONObject("map").getString("mapId")
            val result = synchronized(storageLock) {
                runCatching {
                    val storage = mapStorage(id)
                    // Read the destination even when a different map is currently displayed.
                    // Corrupt/unreadable existing data must never be treated as a new map.
                    val existing = if (storage.baseFile.exists() || File(storage.baseFile.path + ".bak").exists())
                        storage.openRead().use { readLimited(it) } else null
                    if (expectedBase != null) {
                        val actual = existing?.let { String(it, StandardCharsets.UTF_8) } ?: ""
                        check(actual == expectedBase) { "PREVIEW_BASE_CHANGED" }
                    }
                    if (existing != null) {
                        val oldEnvelope = JSONObject(String(existing, StandardCharsets.UTF_8))
                        val oldMap = oldEnvelope.getJSONObject("map")
                        val incoming = JSONObject(text).getJSONObject("map")
                        check(oldMap.getString("mapId") == id) { "STORED_IDENTITY_CONFLICT" }
                        val oldVersion = oldMap.getInt("version")
                        val newVersion = incoming.getInt("version")
                        check(newVersion >= oldVersion) { "STALE_VERSION" }
                        if (newVersion == oldVersion) {
                            check(existing.contentEquals(bytes)) { "VERSION_CONFLICT" }
                        } else {
                            // Retain exact old bytes before replacing the active version.
                            val backup = AtomicFile(File(mapDirectory, "$id.v$oldVersion.backup.json"))
                            if (backup.baseFile.exists()) {
                                check(backup.openRead().use { readLimited(it) }.contentEquals(existing)) { "BACKUP_CONFLICT" }
                            } else {
                                val backupOut = backup.startWrite()
                                try { backupOut.write(existing); backup.finishWrite(backupOut) }
                                catch (failure: Exception) { backup.failWrite(backupOut); throw failure }
                                check(backup.openRead().use { readLimited(it) }.contentEquals(existing)) { "BACKUP_READBACK_FAILED" }
                            }
                        }
                    }
                    val out = storage.startWrite()
                    try {
                        out.write(bytes)
                        storage.finishWrite(out)
                    } catch (error: Exception) {
                        storage.failWrite(out)
                        throw error
                    }
                    // Do not promote a save until a real filesystem readback matches what was written.
                    val readback = storage.openRead().use { readLimited(it) }
                    val digest = MessageDigest.getInstance("SHA-256")
                    check(MessageDigest.isEqual(digest.digest(bytes), digest.digest(readback))) {
                        "Committed bytes do not match file readback"
                    }
                    check(preferences.edit().putString("activeMap", id).commit()) { "could not store active map id" }
                    val savedDigest = sha256(readback)
                    transferDirectory.listFiles()?.filter { it.name.endsWith(".json") }?.forEach { file ->
                        val receiptFile = AtomicFile(file)
                        val receipt = JSONObject(receiptFile.openRead().use { String(readLimited(it), StandardCharsets.UTF_8) })
                        if (receipt.getString("mapId") == id && receipt.getString("sha256") == savedDigest) {
                            receipt.put("status", "OWNER_APPROVED_FILE_READBACK_VERIFIED")
                                .put("readbackSha256", savedDigest).put("savedAt", System.currentTimeMillis())
                            writeReceipt(receiptFile, receipt)
                        }
                    }
                    savedDigest
                }
            }
            if (result.isFailure) callback("nativeStatus", "บันทึกข้อมูลอาจสำเร็จแต่ตรวจอ่านกลับไม่ได้ · ตรวจไฟล์ก่อนกดซ้ำ")
            else callback("nativePersisted", id, JSONObject(text).getJSONObject("map").getInt("version"), result.getOrThrow())
        }

        @JavascriptInterface fun listMaps() {
            val entries = JSONArray()
            synchronized(storageLock) {
                mapDirectory.listFiles()?.filter { it.isFile && it.name.endsWith(".goview.json") }?.forEach { file ->
                    val id = file.name.removeSuffix(".goview.json")
                    if (mapIdPattern.matches(id)) {
                        runCatching {
                            val raw = mapStorage(id).openRead().use { String(readLimited(it), StandardCharsets.UTF_8) }
                            val info = JSONObject(raw).getJSONObject("map")
                            entries.put(JSONObject().put("id", id)
                                .put("title", info.getString("title"))
                                .put("version", info.getInt("version")))
                        }
                    }
                }
            }
            callback("receiveMapList", entries.toString())
        }

        @JavascriptInterface fun openMap(id: String) {
            if (!mapIdPattern.matches(id)) {
                callback("nativeStatus", "ไม่พบแผนที่ที่เลือก")
                return
            }
            val raw = synchronized(storageLock) {
                runCatching {
                    val item = mapStorage(id)
                    val content = item.openRead().use { String(readLimited(it), StandardCharsets.UTF_8) }
                    require(preferences.edit().putString("activeMap", id).commit())
                    content
                }.getOrNull()
            }
            if (raw != null) callback("receiveNativePackage", raw)
            else callback("nativeStatus", "เปิดไฟล์แผนที่ไม่ได้ · ไม่มีการลบข้อมูล")
        }

        @JavascriptInterface fun chooseImport() {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivityForResult(intent, 701)
            }
        }

        @JavascriptInterface fun exportFile(text: String, filename: String, mime: String) {
            val bytes = text.toByteArray(StandardCharsets.UTF_8)
            if (bytes.size > maxSize || (mime == "application/json" && !validPackage(text)) ||
                (mime != "application/json" && mime != "application/geo+json")) {
                callback("nativeStatus", "ไม่ส่งออก: ไฟล์ไม่ถูกต้องหรือใหญ่เกิน")
                return
            }
            val exported = if (mime == "application/json") synchronized(storageLock) { runCatching {
                val requested = JSONObject(text)
                val map = requested.getJSONObject("map")
                val stored = mapStorage(map.getString("mapId")).openRead().use { readLimited(it) }
                val saved = JSONObject(String(stored, StandardCharsets.UTF_8))
                check(saved.getJSONObject("map").getInt("version") == map.getInt("version") &&
                    saved.getString("checksum") == requested.getString("checksum")) { "SAVE_BEFORE_EXPORT" }
                stored
            }.getOrNull() } else bytes
            if (exported == null) { callback("nativeStatus", "Save and verify this version before exporting"); return }
            pendingExport = exported
            runOnUiThread {
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = mime
                    putExtra(Intent.EXTRA_TITLE, filename.replace(Regex("[^a-zA-Z0-9_.-]"), "_").take(100))
                }
                startActivityForResult(intent, 702)
            }
        }

        @JavascriptInterface fun exportReceipt() {
            val entries = synchronized(storageLock) {
                transferDirectory.listFiles()?.filter { it.name.endsWith(".json") }
                    ?.sortedByDescending { it.lastModified() }?.mapNotNull { file ->
                        runCatching {
                            val receipt = JSONObject(AtomicFile(file).openRead().use { String(readLimited(it), StandardCharsets.UTF_8) })
                            file to (receipt.getString("transferId") + " · " + receipt.getString("mapId") +
                                " v" + receipt.getInt("version") + " · " + receipt.getString("status"))
                        }.getOrNull()
                    }.orEmpty()
            }
            if (entries.isEmpty()) { callback("nativeStatus", "No saved transfer receipts"); return }
            runOnUiThread {
                android.app.AlertDialog.Builder(this@GoviewStudioActivity).setTitle("Choose transfer receipt")
                    .setItems(entries.map { it.second }.toTypedArray()) { _, index -> showReceipt(entries[index].first) }
                    .setNegativeButton("Cancel", null).show()
            }
        }

        private fun showReceipt(file: File) {
            val result = synchronized(storageLock) { runCatching {
                val receipt = JSONObject(AtomicFile(file).openRead().use { String(readLimited(it), StandardCharsets.UTF_8) })
                val storage = mapStorage(receipt.getString("mapId"))
                val present = storage.baseFile.exists() || File(storage.baseFile.path + ".bak").exists()
                val stored = if (present) runCatching { storage.openRead().use { readLimited(it) } }.getOrNull() else null
                receipt.put("currentReadbackStatus", if (!present) "NOT_SAVED" else if (stored == null) "READ_FAILED" else "READ_VERIFIED")
                    .put("currentReadbackSha256", stored?.let { sha256(it) } ?: JSONObject.NULL)
                    .put("matchesTransferredArtifact", stored != null && sha256(stored) == receipt.getString("sha256"))
                receipt.toString(2).toByteArray(StandardCharsets.UTF_8)
            } }
            result.onSuccess { bytes ->
                runOnUiThread {
                    android.app.AlertDialog.Builder(this@GoviewStudioActivity).setTitle("Transfer receipt / current readback")
                        .setMessage(String(bytes, StandardCharsets.UTF_8))
                        .setPositiveButton("Export receipt") { _, _ ->
                            pendingExport = bytes
                            startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                                addCategory(Intent.CATEGORY_OPENABLE); type = "application/json"
                                putExtra(Intent.EXTRA_TITLE, "goview-transfer-receipt.json")
                            }, 702)
                        }.setNegativeButton("Close", null).show()
                }
            }.onFailure { callback("nativeStatus", "Receipt/readback unavailable · no data changed") }
        }

        @JavascriptInterface fun downloadExact(endpoint: String, mapId: String, token: String,
            expectedVersion: String, expectedSha256: String, transferId: String) {
            if (expectedVersion.toIntOrNull() !in 1..1000000 ||
                !Regex("[a-f0-9]{64}").matches(expectedSha256) ||
                !Regex("[a-zA-Z0-9_-]{1,80}").matches(transferId)) {
                callback("nativeStatus", "Exact version, full SHA-256 and transfer ID required"); return
            }
            // GO access is optional. No token is embedded in the APK, preference file, or map package.
            // A redirect must never forward a bearer credential to another host.
            val uri = runCatching { URI(endpoint.trim()) }.getOrNull()
            val host = uri?.host?.lowercase()
            // Send the owner-entered read credential only to our known map receiver.
            // Do not accept arbitrary workers.dev hostnames, even though they use HTTPS.
            val approvedHost = host == "goview.yggmetro.com" ||
                host == "goview-package-bridge.pureekangraw.workers.dev"
            if (uri == null || uri.scheme != "https" || !approvedHost ||
                uri.userInfo != null || uri.query != null || uri.fragment != null ||
                uri.port != -1 || (uri.path != null && uri.path != "" && uri.path != "/") ||
                !mapIdPattern.matches(mapId) || token.length !in 20..512 ||
                token.any { it <= ' ' || it == '\u007f' }) {
                callback("nativeStatus", "เชื่อม GO ไม่ได้: ตรวจ HTTPS, Worker domain, Map ID และคีย์")
                return
            }
            val client = OkHttpClient.Builder()
                .followRedirects(false).followSslRedirects(false)
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS).build()
            val url = endpoint.trim().trimEnd('/') + "/v1/maps/" + mapId + "/packages/" + expectedVersion
            Thread {
                val result = runCatching {
                    val request = Request.Builder().url(url)
                        .header("Authorization", "Bearer " + token)
                        .header("x-goview-transfer-id", transferId).get().build()
                    client.newCall(request).execute().use { response ->
                        if (!response.isSuccessful) {
                            error("GO HTTP " + response.code)
                        }
                        val stream = response.body?.byteStream() ?: error("GO returned empty response")
                        val bytes = stream.use { readLimited(it) }
                        val text = String(bytes, StandardCharsets.UTF_8)
                        validateDownloadedPackage(text, mapId,
                            response.header("x-goview-version"), response.header("x-goview-sha256"))
                        GoviewArtifact.verify(bytes, mapId, expectedVersion.toInt(), expectedSha256)
                        check(response.header("x-goview-transfer-id") == transferId) { "TRANSFER_ID_MISMATCH" }
                        synchronized(storageLock) {
                            val receipt = JSONObject().put("transferId", transferId).put("mapId", mapId)
                                .put("version", expectedVersion.toInt()).put("sha256", expectedSha256)
                                .put("endpoint", uri.host).put("status", "DOWNLOADED_VERIFIED_NOT_APPLIED")
                            val file = AtomicFile(File(transferDirectory, "$transferId.json"))
                            if (file.baseFile.exists()) {
                                val prior = JSONObject(file.openRead().use { String(readLimited(it), StandardCharsets.UTF_8) })
                                check(prior.getString("sha256") == expectedSha256 && prior.getString("mapId") == mapId &&
                                    prior.getInt("version") == expectedVersion.toInt()) { "TRANSFER_ID_CONFLICT" }
                            } else writeReceipt(file, receipt)
                        }
                        text
                    }
                }
                preferences.edit().putString("endpoint", uri.host).putString("transferId", transferId)
                    .putString("endpointStatus", if (result.isSuccess) "EXACT_DOWNLOAD_VERIFIED" else "DOWNLOAD_FAILED").apply()
                result.onSuccess { callback("receiveDownload", it, transferId) }
                    .onFailure { callback("nativeStatus", "GO Download failed · correlation: " + transferId) }
            }.start()
        }

        @JavascriptInterface fun locate() { runOnUiThread { showLocation() } }
    }

    private fun validateDownloadedPackage(text: String, mapId: String, version: String?, sha256: String?) {
        check(validPackage(text)) { "INVALID_PACKAGE" }
        val received = JSONObject(text).getJSONObject("map")
        check(received.getString("mapId") == mapId) { "DOWNLOAD_IDENTITY_MISMATCH" }
        check(version == received.getInt("version").toString()) { "DOWNLOAD_VERSION_MISMATCH" }
        val digest = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 255) }
        check(sha256 == digest) { "DOWNLOAD_DIGEST_MISMATCH" }
    }

    private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it.toInt() and 255) }

    private fun writeReceipt(file: AtomicFile, receipt: JSONObject) {
        val bytes = receipt.toString().toByteArray(StandardCharsets.UTF_8)
        val out = file.startWrite()
        try { out.write(bytes); file.finishWrite(out) }
        catch (failure: Exception) { file.failWrite(out); throw failure }
        check(file.openRead().use { readLimited(it) }.contentEquals(bytes)) { "RECEIPT_READBACK_FAILED" }
    }

    private fun readLimited(input: java.io.InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val chunk = ByteArray(8192)
        while (true) {
            val n = input.read(chunk)
            if (n < 0) break
            output.write(chunk, 0, n)
            require(output.size() <= maxSize) { "file exceeds GOVIEW package limit" }
        }
        return output.toByteArray()
    }

    private fun showLocation() {
        val permission = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!permission) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 703)
            callback("setGps", "GPS: ต้องอนุญาตตำแหน่งก่อน")
            return
        }
        val manager = getSystemService(LocationManager::class.java)
        val last = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).mapNotNull { provider ->
            runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
        }.maxByOrNull { it.elapsedRealtimeNanos }
        if (last == null || SystemClock.elapsedRealtimeNanos() - last.elapsedRealtimeNanos > 30_000_000_000L) {
            callback("setGps", "GPS: ยังไม่มีตำแหน่งล่าสุดใน 30 วินาที · เปิด GPS ในหน้าหอดูดาวแล้วลองใหม่")
            return
        }
        callback("setGps", "GPS: พิกัดล่าสุดของเครื่อง (ไม่บันทึกประวัติ)", last.latitude, last.longitude)
    }

    @Deprecated("Android document chooser callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 701 && resultCode == RESULT_OK) {
            val uri = data?.data ?: return
            val result = runCatching { contentResolver.openInputStream(uri)?.use { input -> readLimited(input) } ?: error("Cannot read file") }
            result.onSuccess { callback("receiveImport", String(it, StandardCharsets.UTF_8)) }
                .onFailure { callback("nativeStatus", "นำเข้าไม่ได้: ไฟล์ใหญ่เกินหรืออ่านไม่ได้") }
        }
        if (requestCode == 702) {
            val bytes = pendingExport
            pendingExport = null
            if (resultCode == RESULT_OK && bytes != null && data?.data != null) {
                runCatching { contentResolver.openOutputStream(data.data!!, "w")?.use { it.write(bytes);it.flush() } ?: error("Cannot save file") }
                    .onSuccess { callback("nativeStatus", "ส่งแพ็กเกจไปยังไฟล์ที่เลือกแล้ว") }
                    .onFailure { callback("nativeStatus", "เขียนไฟล์ปลายทางไม่สำเร็จ") }
            }
        }
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            web.removeJavascriptInterface("GoviewHost")
            web.destroy()
        }
        super.onDestroy()
    }
}
