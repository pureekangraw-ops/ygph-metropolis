package com.big.gobrowser.outsideview

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.big.gobrowser.transport.MetropolisMcpClient
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Explicit foreground-only map observation using the deployed Metropolis OAuth Station.
 * No remote map commands are accepted here: the currently deployed Station is read-only.
 * An ACK is transport/readback evidence, not proof that GO has viewed the map.
 */
class ObservatoryMapShare(
    context: Context,
    private val store: MapStateStore,
    private val ready: () -> Boolean,
    private val report: (String) -> Unit
) {
    private val client = MetropolisMcpClient(context)
    private val prefs = context.getSharedPreferences("observatory-map-observer-v1", Context.MODE_PRIVATE)
    private val handler = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var generation = 0L
    @Volatile private var closed = false
    private var epoch = 0L
    private var sequence = 0L
    private var inFlight = false
    var sharing = false
        private set
    var lastAck: Long? = null
        private set
    var deliveryFailed = false
        private set
    var acknowledgedRevision: Long? = null
        private set

    private val loop = object : Runnable {
        override fun run() {
            if (!sharing || closed) return
            publishIfRendered()
            handler.postDelayed(this, 5_000L)
        }
    }

    fun isPaired(): Boolean = client.pairedObservatory() != null

    fun start(): Boolean {
        if (sharing) return true
        if (!isPaired()) {
            report("เชื่อม GO และจับคู่ Observatory Work จากหน้าบราวเซอร์ก่อน")
            return false
        }
        val next = maxOf(System.currentTimeMillis(), prefs.getLong("epoch", 0L) + 1L)
        if (!prefs.edit().putLong("epoch", next).commit()) {
            report("บันทึก session แชร์แผนที่ไม่ได้")
            return false
        }
        epoch = next
        sequence = 0L
        generation += 1L
        sharing = true
        lastAck = null
        deliveryFailed = false
        acknowledgedRevision = null
        report("แชร์แผนที่ให้ GO แบบอ่านอย่างเดียวเมื่อเฟรมพร้อม")
        handler.post(loop)
        return true
    }

    fun stop() {
        sharing = false
        generation += 1L
        handler.removeCallbacks(loop)
        inFlight = false
        lastAck = null
        acknowledgedRevision = null
    }

    fun close() {
        stop()
        closed = true
        io.shutdownNow()
        client.close()
    }

    private fun publishIfRendered() {
        if (inFlight || !ready() || !isPaired()) return
        val journal = store.load()
        if (journal.pending != null || journal.renderedRevision != journal.state.revision) return
        val state = journal.state
        val captureId = UUID.randomUUID().toString()
        val nextSequence = ++sequence
        val snapshot = JSONObject()
            .put("schema", "observatory.map.snapshot.v1")
            .put("captureId", captureId)
            .put("capturedAtEpochMs", System.currentTimeMillis())
            .put("sequence", nextSequence)
            .put("epoch", epoch)
            .put("revision", state.revision)
            .put("state", JSONObject()
                .put("zones", JSONArray().apply {
                    state.zones.values.forEach { put(MapCommandCodec.encode(MapCommand("_", MapAction.UPSERT_ZONE, zone = it)).getJSONObject("zone")) }
                })
                .put("grids", JSONArray().apply {
                    state.grids.values.forEach { put(MapCommandCodec.encode(MapCommand("_", MapAction.UPSERT_GRID, grid = it)).getJSONObject("grid")) }
                })
                .put("pins", JSONArray().apply {
                    state.pins.values.forEach { put(MapCommandCodec.encode(MapCommand("_", MapAction.UPSERT_PIN, pin = it)).getJSONObject("pin")) }
                })
                .put("notes", JSONArray().apply {
                    state.notes.forEach { (id, value) -> put(JSONObject().put("id", id).put("value", value)) }
                })
            )
        val current = generation
        inFlight = true
        io.execute {
            val result = runCatching { client.publishSnapshot("map", snapshot) }
            handler.post {
                if (current != generation || closed || !sharing) return@post
                inFlight = false
                result.onSuccess { ack ->
                    val confirmed = ack.optBoolean("accepted") &&
                        ack.optString("operation") == "observe" &&
                        ack.optString("captureId") == captureId &&
                        ack.optLong("sequence", -1L) == nextSequence
                    deliveryFailed = !confirmed
                    if (confirmed) {
                        acknowledgedRevision = state.revision
                        lastAck = System.currentTimeMillis()
                        report("Metropolis รับ snapshot แผนที่แล้ว · revision ${state.revision}")
                    } else report("ข้อมูลตอบรับแผนที่ไม่ตรงกับที่ส่ง")
                }.onFailure {
                    deliveryFailed = true
                    report("แชร์แผนที่ไม่สำเร็จ: ${it.message?.take(100)}")
                }
            }
        }
    }
}
