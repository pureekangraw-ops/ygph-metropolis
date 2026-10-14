package com.big.gobrowser.outsideview

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.big.gobrowser.transport.PantheonObservatoryClient
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Foreground-only map observation through PANTHEON's scoped device token.
 * No remote map commands are accepted: this rail is observe-only.
 * An ACK is transport/readback evidence, not proof that GO has viewed the map.
 */
class ObservatoryMapShare(
    context: Context,
    private val store: MapStateStore,
    private val ready: () -> Boolean,
    private val report: (String) -> Unit,
    private val viewport: () -> JSONObject = { JSONObject() }
) {
    private val client = PantheonObservatoryClient(context)
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

    fun isPaired(): Boolean = client.isPaired()

    fun start(): Boolean {
        if (sharing) return true
        if (!isPaired()) {
            report("เชื่อม PANTHEON จากหน้าบราวเซอร์ก่อน")
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
        report("ส่งแผนที่เข้า PANTHEON แบบอ่านอย่างเดียวเมื่อเฟรมพร้อม")
        handler.post(loop)
        return true
    }

    fun stop() {
        if (sharing) client.stopObservation("map", epoch)
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
        io.shutdown()
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
            .put("viewport", viewport())
            .put("state", JSONObject()
                .put("zones", JSONArray().apply {
                    state.zones.values.take(12).forEach { put(MapCommandCodec.encode(MapCommand("_", MapAction.UPSERT_ZONE, zone = it)).getJSONObject("zone")) }
                })
                .put("grids", JSONArray().apply {
                    state.grids.values.take(12).forEach { put(MapCommandCodec.encode(MapCommand("_", MapAction.UPSERT_GRID, grid = it)).getJSONObject("grid")) }
                })
                .put("pins", JSONArray().apply {
                    state.pins.values.take(40).forEach { put(MapCommandCodec.encode(MapCommand("_", MapAction.UPSERT_PIN, pin = it)).getJSONObject("pin")) }
                })
                .put("notes", JSONArray().apply {
                    state.notes.entries.take(12).forEach { (id, value) -> put(JSONObject().put("id", id).put("value", value.take(400))) }
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
                        report("PANTHEON รับ snapshot แผนที่แล้ว · revision ${state.revision}")
                    } else report("ข้อมูลตอบรับแผนที่ไม่ตรงกับที่ส่ง")
                }.onFailure {
                    deliveryFailed = true
                    report("แชร์แผนที่ไม่สำเร็จ: ${it.message?.take(100)}")
                }
            }
        }
    }
}

