package com.big.gobrowser.outsideview

import org.json.JSONArray
import org.json.JSONObject

/** Versioned batch exchange, not executable commands or remote access. */
data class MapUpdateReceipt(
    val id:String, val packageId:String, val packageVersion:Long, val status:String,
    val revision:Long, val added:Int=0, val changed:Int=0, val error:String?=null,
    val createdAt:Long=System.currentTimeMillis()
)

object MapUpdatePackage {
    const val FORMAT="goview.map-update"
    fun export(journal:MapJournal):String {
        require(journal.pending==null){"Wait for pending map command"}
        require(journal.state.pins.size in 1..GeoJsonImport.MAX_FEATURES){"Export supports 1..1000 pins; no records were truncated"}
        val features=JSONArray()
        journal.state.pins.values.sortedBy {it.id}.forEach {pin->
            val record=MapCommandCodec.encode(MapCommand("export",MapAction.UPSERT_PIN,pin=pin)).getJSONObject("pin")
            val properties=JSONObject().put("name",pin.label).put("goviewRecord",record)
            journal.state.notes[pin.id]?.let {properties.put("goviewOwnerNote",it)}
            features.put(JSONObject().put("type","Feature").put("id",pin.id)
                .put("geometry",JSONObject().put("type","Point").put("coordinates",JSONArray().put(pin.point.longitude).put(pin.point.latitude)))
                .put("properties",properties))
        }
        val output=JSONObject().put("type","FeatureCollection").put("schemaVersion",1).put("name","GOVIEW")
            .put("goview",JSONObject().put("format",FORMAT).put("version",journal.state.revision))
            .put("features",features).toString()
        require(output.toByteArray(Charsets.UTF_8).size<=GeoJsonImport.MAX_BYTES){"Export exceeds import limit; no records were truncated"}
        return output
    }

    /** A file's assertion of verification is provenance, not local field verification. */
    fun importedClaim(pin:Pin):Pin = if(pin.evidence.coordinate==EvidenceStatus.VERIFIED)
        pin.copy(evidence=pin.evidence.copy(coordinate=EvidenceStatus.UNKNOWN,source="imported-claim:VERIFIED:${pin.evidence.source.orEmpty()}")) else pin
}
