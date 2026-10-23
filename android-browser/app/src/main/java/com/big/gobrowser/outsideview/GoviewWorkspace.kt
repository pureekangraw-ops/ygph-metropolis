package com.big.gobrowser.outsideview

import org.json.JSONObject

/** A proposal is local data, never an instruction or permission to write. */
class MapUpdatePreview internal constructor(
    val correlationId:String,val expectedRevision:Long,val packageVersion:Long,
    val added:Int,val duplicates:Int,internal val batch:GeoJsonBatch
)
data class SelectedSnapshot(val captureId:String,val version:Long,val json:String,val receipt:MapUpdateReceipt)
class BackupPreview internal constructor(val name:String,val expectedRevision:Long,val pins:Int,internal val checksum:String)

/** Additive contract proposal only. No URL, credential or network implementation. */
object GoviewSandboxContract {
    const val VERSION=1
    /** File/sandbox boundary, never a deployed endpoint. Strict outer field allowlist. */
    fun readFile(input:java.io.InputStream):GeoJsonBatch {
        val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
        while(true){val n=input.read(buffer);if(n<0)break;require(output.size()+n<=GeoJsonImport.MAX_BYTES);output.write(buffer,0,n)}
        val bytes=output.toByteArray()
        val raw=Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString()
        // Ordinary GeoJSON keeps the existing bounded parser. A contract envelope must be explicit.
        var depth=0;var quoted=false;var escaped=false
        for(c in raw){if(quoted){if(escaped)escaped=false else if(c=='\\')escaped=true else if(c=='"')quoted=false}else when(c){'"'->quoted=true;'{','['->{depth++;require(depth<=16)};'}',']'->depth--}}
        val tokener=org.json.JSONTokener(raw);val envelope=tokener.nextValue() as? JSONObject?:error("Object required")
        require(tokener.nextClean()=='\u0000')
        if(!envelope.has("contractVersion"))return GeoJsonImport.parse(bytes.inputStream())
        require(envelope.keys().asSequence().toSet()==setOf("contractVersion","operation","sourceCaptureId","baseVersion","package")){"Unexpected proposal fields"}
        require(envelope.get("contractVersion").toString()=="1" && envelope.getString("operation")=="propose-update")
        val capture=envelope.getString("sourceCaptureId");require(capture.matches(Regex("[a-zA-Z0-9_-]{8,100}")))
        val version=envelope.get("baseVersion");require(version is Number)
        val base=version.toString().toBigDecimal().longValueExact();require(base>=0)
        return GeoJsonImport.parse(envelope.getJSONObject("package").toString().byteInputStream()).copy(sourceCaptureId=capture,baseVersion=base)
    }

    val operations=setOf("read-selected-snapshot","upload-selected-package","download-proposal","propose-update")
    fun blocked(operation:String,correlationId:String):JSONObject {
        require(operation in operations && correlationId.isNotBlank())
        return JSONObject().put("contractVersion",VERSION).put("operation",operation).put("correlationId",correlationId)
            .put("status","BLOCKED").put("environment","sandbox-contract-only")
            .put("reason","No deployed and authorized package-transfer contract")
    }
    // commit is deliberately absent: only the local owner approval path can mutate map state.
}
