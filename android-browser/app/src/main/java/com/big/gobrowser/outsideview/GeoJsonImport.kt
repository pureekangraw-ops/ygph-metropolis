package com.big.gobrowser.outsideview

import org.json.JSONObject
import java.io.InputStream
import java.security.MessageDigest

/** Local owner import, not remote command authority or geographic verification. */
data class GeoJsonBatch(val pins: List<Pin>)

object GeoJsonImport {
    const val MAX_BYTES = 1_048_576
    const val MAX_FEATURES = 1000
    const val MAX_STORED_PINS = 10000
    private fun digest(value: String) = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    fun parse(input: InputStream): GeoJsonBatch {
        val bytes = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            require(bytes.size() + n <= MAX_BYTES) { "GeoJSON exceeds 1 MiB" }
            bytes.write(buffer, 0, n)
        }
        val text = Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes.toByteArray())).toString()
        // Bound nesting before handing untrusted JSON to the platform parser.
        var depth = 0; var quoted = false; var escaped = false
        for (c in text) {
            if (quoted) { if (escaped) escaped=false else if(c=='\\') escaped=true else if(c=='"') quoted=false }
            else when(c) { '"' -> quoted=true; '{','[' -> {depth++;require(depth<=16){"GeoJSON nesting limit"}}; '}',']' -> depth-- }
        }
        val tokener=org.json.JSONTokener(text)
        val document = tokener.nextValue() as? JSONObject ?: error("GeoJSON object required")
        require(tokener.nextClean()=='\u0000') {"Trailing JSON data"}
        require(document.getString("type") == "FeatureCollection") { "FeatureCollection required" }
        if (document.has("schemaVersion")) require(document.get("schemaVersion") is Number && document.get("schemaVersion").toString().toBigDecimalOrNull()?.compareTo(java.math.BigDecimal.ONE)==0) { "Unsupported GeoJSON schemaVersion" }
        val dataset = document.optString("name", "owner-import").also { require(it.length in 1..256) }
        val namespace = "geojson:v1:${digest(dataset)}:"
        val features = document.getJSONArray("features")
        require(features.length() in 1..MAX_FEATURES) { "Import requires 1..1000 points" }
        val seen = mutableSetOf<String>()
        val pins = (0 until features.length()).map { i ->
            val feature = features.getJSONObject(i)
            require(feature.getString("type") == "Feature")
            val geometry = feature.getJSONObject("geometry")
            require(geometry.getString("type") == "Point") { "Only Point geometry supported" }
            val coordinates = geometry.getJSONArray("coordinates")
            require(coordinates.length() == 2) { "Only 2D Point coordinates supported" }
            require(coordinates.get(0) is Number && coordinates.get(1) is Number) { "Numeric coordinates required" }
            val point = Point(coordinates.getDouble(0), coordinates.getDouble(1))
            require(!feature.has("properties") || feature.isNull("properties") || feature.get("properties") is JSONObject) { "Properties must be an object or null" }
            val properties = feature.optJSONObject("properties") ?: JSONObject()
            val rawId = if(feature.has("id")) feature.get("id") else properties.opt("id")
            require(rawId is String || rawId is Number) { "Stable feature id required" }
            val sourceId = rawId.toString().also { require(it.length in 1..128) }
            val id = namespace + sourceId
            require(seen.add(id)) { "Duplicate feature id" }
            val label = properties.optString("name", properties.optString("label", sourceId))
            require(label.length in 1..256) { "Name exceeds limit" }
            val note = canonical(properties).also { require(it.length <= 8192) { "Properties exceed limit" } }
            Pin(id, label, point, "", Evidence(EvidenceStatus.UNKNOWN, "owner-geojson:$dataset"), note=note)
        }
        return GeoJsonBatch(pins)
    }

    /** Stable property text independent of JSON object iteration/key order, including nested objects. */
    private fun canonical(value:Any?):String = when(value) {
        null, JSONObject.NULL -> "null"
        is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(",","{","}") {key->JSONObject.quote(key)+":"+canonical(value.get(key))}
        is org.json.JSONArray -> (0 until value.length()).joinToString(",","[","]") {canonical(value.get(it))}
        is String -> JSONObject.quote(value)
        else -> value.toString()
    }

    /** Saving already succeeded. Always attempt reload even when fitting the camera fails. */
    fun present(fit:()->Unit,reload:()->Unit):Boolean {
        val fitted=runCatching(fit).isSuccess
        val reloaded=runCatching(reload).isSuccess
        return fitted && reloaded
    }

    fun merge(journal: MapJournal, batch: GeoJsonBatch): MapJournal {
        require(journal.pending == null) { "Wait for pending map render" }
        val pins = journal.state.pins.toMutableMap()
        batch.pins.forEach { pin ->
            val existing = pins[pin.id]
            require(existing == null || existing == pin) { "Conflicting source id; existing data preserved" }
            pins[pin.id] = pin
        }
        require(pins.size <= MAX_STORED_PINS) { "Stored pin limit reached" }
        require(pins.values.sumOf {it.label.length.toLong()+it.note.orEmpty().length} <= 8_388_608) { "Stored text limit reached" }
        if(pins == journal.state.pins) return journal
        return journal.copy(state=journal.state.copy(pins=pins, revision=journal.state.revision+1), renderedRevision=-1)
    }
}
