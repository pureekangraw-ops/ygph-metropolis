package com.big.gobrowser.transport

import com.big.gobrowser.control.BrowserAction
import com.big.gobrowser.control.Command
import com.big.gobrowser.control.Receipt
import com.big.gobrowser.observer.Snapshot
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Transport boundary only. The owner supplies all three exact HTTPS routes. */
interface RelayClient {
    fun publish(snapshot: Snapshot): Ack
    fun pollCommands(): List<Command>
    fun publishReceipt(receipt: Receipt): Ack
}

data class Ack(val id: String, val sequence: Long, val acceptedAtEpochMs: Long)

data class RelayEndpoints(
    val publishSnapshots: String,
    val pollCommands: String,
    val publishReceipts: String
) {
    init {
        listOf(publishSnapshots, pollCommands, publishReceipts).forEach { endpoint ->
            require(endpoint.startsWith("https://")) { "Relay endpoints must use HTTPS" }
            require(!endpoint.contains(" ")) { "Relay endpoint must not contain spaces" }
        }
    }
}

class RelayNotConfigured(message: String) : IllegalStateException(message)
class RelayProtocolException(message: String) : IllegalStateException(message)

/**
 * Generic authenticated HTTPS adapter. It deliberately does not contain a route,
 * Work ID, MCP path, or owner-specific field name. Those are supplied by the
 * verified owner contract through RelayEndpoints and the JSON schema.
 */
class HttpRelayClient(
    private val endpoints: RelayEndpoints,
    private val credentials: DeviceCredentialStore,
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 20_000,
    private val clock: () -> Long = { System.currentTimeMillis() }
) : RelayClient {
    override fun publish(snapshot: Snapshot): Ack =
        post(endpoints.publishSnapshots, snapshotJson(snapshot)).toAck(snapshot.captureId, snapshot.sequence)

    override fun pollCommands(): List<Command> {
        val response = request(endpoints.pollCommands, "GET", null)
        val root = runCatching { JSONArray(response) }.getOrElse {
            val objectRoot = runCatching { JSONObject(response) }.getOrNull()
                ?: throw RelayProtocolException("Command response is not JSON")
            objectRoot.optJSONArray("commands")
                ?: throw RelayProtocolException("Command response has no commands array")
        }
        return List(root.length()) { index -> commandFromJson(root.getJSONObject(index)) }
    }

    override fun publishReceipt(receipt: Receipt): Ack =
        post(endpoints.publishReceipts, receiptJson(receipt)).toAck(receipt.commandId, 0L)

    private fun post(endpoint: String, body: JSONObject): JSONObject {
        val response = request(endpoint, "POST", body.toString()).trim()
        return if (response.isEmpty()) JSONObject() else JSONObject(response)
    }

    private fun request(endpoint: String, method: String, body: String?): String {
        val token = credentials.load() ?: throw RelayNotConfigured("Device relay credential is not configured")
        val connection = (URL(endpoint).openConnection() as? HttpURLConnection)
            ?: throw RelayProtocolException("Relay endpoint is not HTTP")
        try {
            connection.requestMethod = method
            connection.connectTimeout = connectTimeoutMs
            connection.readTimeout = readTimeoutMs
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) throw RelayProtocolException("Relay HTTP $status")
            return text
        } finally {
            connection.disconnect()
        }
    }

    private fun JSONObject.toAck(defaultId: String, defaultSequence: Long): Ack = Ack(
        id = optString("id", defaultId),
        sequence = optLong("sequence", defaultSequence),
        acceptedAtEpochMs = optLong("acceptedAtEpochMs", clock())
    )

    companion object {
        private fun snapshotJson(snapshot: Snapshot) = JSONObject().apply {
            put("deviceId", snapshot.deviceId)
            put("tabId", snapshot.tabId)
            put("captureId", snapshot.captureId)
            put("revision", snapshot.revision)
            put("sequence", snapshot.sequence)
            put("capturedAtEpochMs", snapshot.capturedAtEpochMs)
            put("appVersion", snapshot.appVersion)
            put("schema", snapshot.schema)
            put("url", snapshot.url)
            put("title", snapshot.title)
            put("text", snapshot.text)
            put("truncated", snapshot.truncated)
            put("targets", JSONArray().also { array -> snapshot.targets.forEach { target ->
                array.put(JSONObject().apply {
                    put("id", target.id)
                    put("role", target.role ?: JSONObject.NULL)
                    put("label", target.label ?: JSONObject.NULL)
                    put("kind", target.kind)
                    put("left", target.left); put("top", target.top)
                    put("right", target.right); put("bottom", target.bottom)
                })
            } })
        }

        private fun receiptJson(receipt: Receipt) = JSONObject().apply {
            put("commandId", receipt.commandId)
            put("status", receipt.status.name)
            put("reason", receipt.reason)
            put("beforeCaptureId", receipt.beforeCaptureId ?: JSONObject.NULL)
            put("afterCaptureId", receipt.afterCaptureId ?: JSONObject.NULL)
            put("executedAtEpochMs", receipt.executedAtEpochMs)
            put("readback", receipt.readback ?: JSONObject.NULL)
            put("businessOutcome", receipt.businessOutcome.name)
        }

        private fun commandFromJson(json: JSONObject) = Command(
            commandId = json.getString("commandId"),
            actor = json.getString("actor"),
            workId = json.getString("workId"),
            checkpointId = json.getString("checkpointId"),
            tabId = json.getString("tabId"),
            deviceId = json.getString("deviceId"),
            captureId = json.getString("captureId"),
            revision = json.getLong("revision"),
            epoch = json.getLong("epoch"),
            issuedAtEpochMs = json.getLong("issuedAtEpochMs"),
            expiresAtEpochMs = json.getLong("expiresAtEpochMs"),
            action = BrowserAction.valueOf(json.getString("action")),
            authority = json.getString("authority"),
            parameters = json.optJSONObject("parameters")?.let { params ->
                params.keys().asSequence().associateWith { key -> params.optString(key) }
            }.orEmpty()
        )
    }
}
