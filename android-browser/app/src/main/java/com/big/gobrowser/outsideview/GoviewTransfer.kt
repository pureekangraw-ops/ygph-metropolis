package com.big.gobrowser.outsideview

import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

/** Shared transport metadata; domain approval/storage remains with the existing adapters. */
data class GoviewTransfer(val transferId:String,val operation:String,val payloadType:String,val identity:JSONObject,val sha256:String,val payload:String) {
    fun json():String=JSONObject().put("schema","goview.transfer.v1").put("transferId",transferId).put("operation",operation)
        .put("payloadType",payloadType).put("identity",identity).put("sha256",sha256).put("payload",payload).toString()
    companion object {
        const val MAX_ENVELOPE=2*1048576+8192
        fun digest(raw:String)=MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
        fun validId(id:String)=id.matches(Regex("[a-zA-Z0-9_-]{8,80}"))
        fun snapshot(s:SelectedSnapshot):GoviewTransfer {
            require(s.captureId.length<=71 && validId(s.captureId))
            return parse(GoviewTransfer(s.captureId,"SNAPSHOT","goview.map-update",JSONObject().put("captureId",s.captureId).put("baseVersion",s.version),digest(s.json),s.json).json())
        }
        fun parse(raw:String):GoviewTransfer {
            require(raw.toByteArray(Charsets.UTF_8).size<=MAX_ENVELOPE)
            val tokener=org.json.JSONTokener(raw)
            val o=tokener.nextValue() as? JSONObject?:error("TRANSFER_OBJECT_REQUIRED")
            require(tokener.nextClean()=='\u0000')
            require(o.keys().asSequence().toSet()==setOf("schema","transferId","operation","payloadType","identity","sha256","payload"))
            require(listOf("schema","transferId","operation","payloadType","sha256","payload").all {o.get(it) is String})
            require(o.getString("schema")=="goview.transfer.v1")
            val e=GoviewTransfer(o.getString("transferId"),o.getString("operation"),o.getString("payloadType"),o.getJSONObject("identity"),o.getString("sha256"),o.getString("payload"))
            require(validId(e.transferId)&&e.payload.toByteArray(Charsets.UTF_8).size<=1048576&&e.sha256==digest(e.payload))
            val i=e.identity
            if(e.payloadType=="goview.map.package.v1") {
                require(e.operation=="STUDIO"&&i.keys().asSequence().toSet()==setOf("mapId","version"))
                require(i.get("version") is Number&&i.getInt("version") in 1..999999&&i.get("version").toString()==i.getInt("version").toString())
                GoviewArtifact.verify(e.payload.toByteArray(Charsets.UTF_8),i.getString("mapId"),i.getInt("version"),e.sha256)
            }else {
                require(e.payloadType=="goview.map-update")
                val fields=if(e.operation=="SNAPSHOT")setOf("captureId","baseVersion")else setOf("captureId","baseVersion","snapshotSha256")
                require(i.keys().asSequence().toSet()==fields)
                val capture=i.getString("captureId");val version=i.getLong("baseVersion")
                require(validId(capture)&&capture.length<=71&&version in 0..9007199254740991L&&i.get("baseVersion") is Number&&i.get("baseVersion").toString()==version.toString())
                if(e.operation=="SNAPSHOT") {
                    require(e.transferId==capture)
                    val p=JSONObject(e.payload)
                    require(p.keys().asSequence().toSet()==setOf("type","schemaVersion","name","goview","features","captureId","capturedAtEpochMs","captureReceipt","selection"))
                    require(p.get("schemaVersion") is Number&&p.getInt("schemaVersion")==1&&p.getString("name")=="GOVIEW")
                    require(p.getJSONObject("goview").keys().asSequence().toSet()==setOf("format","version"))
                    val captureReceipt=p.getJSONObject("captureReceipt")
                    require(captureReceipt.keys().asSequence().toSet()==setOf("id","operation","status","correlationId","version"))
                    require(validId(captureReceipt.getString("id"))&&captureReceipt.getString("operation")=="SNAPSHOT"&&captureReceipt.getString("status")=="CAPTURED_LOCAL"&&captureReceipt.getString("correlationId")==capture&&captureReceipt.getLong("version")==version)
                    require(p.get("capturedAtEpochMs") is Number&&p.getLong("capturedAtEpochMs")>=0)
                    val features=p.getJSONArray("features")
                    for(n in 0 until features.length()) {
                        val f=features.getJSONObject(n)
                        require(f.keys().asSequence().toSet()==setOf("type","id","geometry","properties"))
                        require(f.getJSONObject("geometry").keys().asSequence().toSet()==setOf("type","coordinates"))
                        val props=f.getJSONObject("properties")
                        require(props.keys().asSequence().toSet()==setOf("name","goviewRecord"))
                        val pin=props.getJSONObject("goviewRecord")
                        require(props.get("name") is String&&props.getString("name")==pin.getString("label"))
                        require(pin.keys().asSequence().toSet()==setOf("id","label","point","gridId","evidence","zoneId","note"))
                        require(pin.getJSONObject("point").keys().asSequence().toSet()==setOf("longitude","latitude"))
                        require(pin.getJSONObject("evidence").keys().asSequence().toSet()==setOf("coordinate","source","observedAt","availableUntil"))
                    }
                    val batch=GeoJsonImport.parse(e.payload.byteInputStream())
                    require(batch.snapshotOnly&&batch.nativePackage&&batch.packageVersion==version&&p.getString("captureId")==capture)
                    require(batch.ownerNotes.isEmpty()&&batch.pins.all {it.note==null&&it.category.isEmpty()&&it.zoneId==null&&it.gridId.isEmpty()&&it.evidence==Evidence(EvidenceStatus.UNKNOWN,"selected-owner-snapshot")})
                }else {
                    require(e.operation=="PROPOSAL"&&e.transferId==capture+"-proposal"&&i.getString("snapshotSha256").matches(Regex("[a-f0-9]{64}")))
                    val batch=GoviewSandboxContract.readFile(e.payload.byteInputStream())
                    require(batch.sourceCaptureId==capture&&batch.baseVersion==version)
                }
            }
            return e
        }
    }
}

interface GoviewTransferTransport {
    fun put(envelope:GoviewTransfer):String
    fun get(transferId:String,uploadReadback:Boolean=false):String
    fun receipt(transferId:String,body:String):String
}

/** Durable transfer evidence is separate from map state. No network retry or automatic Update. */
class GoviewSelectedTransfer(private val root:File,private val store:MapStateStore,private val transport:GoviewTransferTransport) {
    private fun file(id:String):File {require(GoviewTransfer.validId(id));return File(root,"$id.json")}
    private fun save(e:GoviewTransfer):Unit = synchronized(store.transactionLock) {
        require(root.isDirectory||root.mkdirs());val target=file(e.transferId)
        if(target.exists()){require(target.readText()==e.json());return@synchronized}
        val temp=File(root,e.transferId+".tmp")
        java.io.FileOutputStream(temp).use {it.write(e.json().toByteArray(Charsets.UTF_8));it.fd.sync()}
        Files.move(temp.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE)
        require(file(e.transferId).readText()==e.json())
    }
    fun local(id:String):GoviewTransfer = synchronized(store.transactionLock) {
        val f=file(id);require(f.length()<=GoviewTransfer.MAX_ENVELOPE)
        GoviewTransfer.parse(f.readText()).also {require(it.transferId==id)}
    }
    fun captures():List<GoviewTransfer> = root.listFiles()?.filter {it.name.endsWith(".json")}?.mapNotNull {runCatching {local(it.name.removeSuffix(".json"))}.getOrNull()}?.filter {it.operation=="SNAPSHOT"}?:emptyList()
    private fun same(actual:String,expected:GoviewTransfer):GoviewTransfer = GoviewTransfer.parse(actual).also {
        require(it.transferId==expected.transferId&&it.operation==expected.operation&&it.payloadType==expected.payloadType&&it.sha256==expected.sha256&&it.payload==expected.payload&&it.identity.keys().asSequence().toSet()==expected.identity.keys().asSequence().toSet()&&it.identity.keys().asSequence().all {key->it.identity.get(key)==expected.identity.get(key)})
    }
    fun upload(snapshot:SelectedSnapshot):GoviewTransfer {
        val expected=GoviewTransfer.snapshot(snapshot)
        save(expected) // Retain identity before dispatch; uncertain outcomes can be explicitly read back.
        same(transport.put(expected),expected)
        return verifyUpload(expected.transferId)
    }
    fun verifyUpload(captureId:String):GoviewTransfer {
        val expected=local(captureId);require(expected.operation=="SNAPSHOT")
        same(transport.get(captureId,true),expected)
        store.recordTransferPhase("UPLOAD","REMOTE_EXACT_READBACK_VERIFIED",expected.transferId,expected.sha256,expected.identity.getLong("baseVersion"))
        return expected
    }
    fun download(captureId:String):MapUpdatePreview {
        val selected=local(captureId);require(selected.operation=="SNAPSHOT")
        val id=captureId+"-proposal"
        val proposal=GoviewTransfer.parse(transport.get(id))
        require(proposal.operation=="PROPOSAL"&&proposal.transferId==id&&proposal.identity.getString("captureId")==captureId&&proposal.identity.getLong("baseVersion")==selected.identity.getLong("baseVersion")&&proposal.identity.getString("snapshotSha256")==selected.sha256)
        val batch=GoviewSandboxContract.readFile(proposal.payload.byteInputStream())
        save(proposal)
        store.receiveFile(batch,id)
        return store.previewUpdate(batch,id)
    }
    /** Called after local approval, or explicitly for retrying only the receipt after restart. */
    fun report(receipt:MapUpdateReceipt) {
        require(receipt.operation=="UPDATE"&&receipt.status in setOf("SAVED","DUPLICATE","COMMITTED_READBACK_UNAVAILABLE"))
        val e=local(receipt.correlationId);require(e.operation=="PROPOSAL")
        val saved=store.load().updates.firstOrNull {it.id==receipt.id}?:error("LOCAL_RECEIPT_MISSING")
        require(saved.correlationId==receipt.correlationId&&saved.revision==receipt.revision&&saved.readbackVerified==receipt.readbackVerified)
        val body=JSONObject().put("transferId",e.transferId).put("sha256",e.sha256).put("operation","UPDATE")
            .put("status",if(receipt.readbackVerified)receipt.status else "COMMITTED_READBACK_UNAVAILABLE").put("revision",receipt.revision).put("readbackVerified",receipt.readbackVerified)
        val ack=JSONObject(transport.receipt(e.transferId,body.toString()))
        require(ack.keys().asSequence().toSet()==body.keys().asSequence().toSet()&&body.keys().asSequence().all {if(it=="revision")ack.get(it) is Number && ack.get(it).toString()==receipt.revision.toString() else body.get(it)==ack.get(it)})
    }
}
