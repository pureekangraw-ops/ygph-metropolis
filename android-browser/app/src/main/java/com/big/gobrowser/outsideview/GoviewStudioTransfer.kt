package com.big.gobrowser.outsideview

import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Typed Studio delivery only. Preview/owner approval and map writes stay in Studio's native save path. */
class GoviewStudioTransfer(private val root:File,private val receipts:File,private val transport:GoviewTransferTransport,
    private val readMap:(String)->ByteArray,private val lock:Any,
    private val readReceipt:(File)->ByteArray={it.readBytes()}) {
    private fun file(id:String):File {require(GoviewTransfer.validId(id));return File(root,"$id.json")}
    private fun receiptFile(id:String):File {require(GoviewTransfer.validId(id));return File(receipts,"$id.json")}
    private fun atomic(file:File,raw:String) {
        require(file.parentFile!!.isDirectory||file.parentFile!!.mkdirs())
        val temp=File(file.parentFile,file.name+".tmp")
        java.io.FileOutputStream(temp).use {it.write(raw.toByteArray(Charsets.UTF_8));it.fd.sync()}
        Files.move(temp.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING)
        check(file.readText()==raw)
    }
    fun local(id:String):GoviewTransfer=synchronized(lock) {
        val f=file(id);require(f.length()<=GoviewTransfer.MAX_ENVELOPE)
        GoviewTransfer.parse(f.readText()).also {require(it.transferId==id&&it.operation=="STUDIO")}
    }
    fun ids():List<String> = synchronized(lock) {root.listFiles()?.filter {it.name.endsWith(".json")}?.mapNotNull {
        runCatching {local(it.name.removeSuffix(".json")).transferId}.getOrNull()
    }?:emptyList()}
    private fun receipt(e:GoviewTransfer):JSONObject {
        val f=receiptFile(e.transferId);require(f.length()<=65536)
        val r=JSONObject(String(readReceipt(f),Charsets.UTF_8))
        require(r.getString("transferId")==e.transferId&&r.getString("mapId")==e.identity.getString("mapId")&&r.getInt("version")==e.identity.getInt("version")&&r.getString("sha256")==e.sha256)
        return r
    }
    fun download(id:String,mapId:String,version:Int,sha256:String):GoviewTransfer {
        require(GoviewTransfer.validId(id)&&mapId.matches(Regex("[a-zA-Z0-9_-]{1,70}"))&&version in 1..999999&&sha256.matches(Regex("[a-f0-9]{64}")))
        val e=GoviewTransfer.parse(transport.get(id))
        require(e.operation=="STUDIO"&&e.transferId==id&&e.identity.getString("mapId")==mapId&&e.identity.getInt("version")==version&&e.sha256==sha256)
        synchronized(lock) {
            val f=file(id)
            if(f.exists())require(local(id).json()==e.json()) else atomic(f,e.json())
            val r=receiptFile(id)
            if(r.exists()||File(r.path+".bak").exists())receipt(e) // preserve exact prior approval/report evidence
            else atomic(r,JSONObject().put("transferId",id).put("mapId",mapId).put("version",version).put("sha256",sha256).put("status","DOWNLOADED_VERIFIED_NOT_APPLIED").toString())
        }
        return e
    }
    /** Explicit report/retry only. Proof comes from native approval AND exact AtomicFile map readback. */
    fun report(id:String):JSONObject {
        val body=synchronized(lock) {
            val e=local(id);val r=receipt(e)
            require(r.getString("status")=="OWNER_APPROVED_FILE_READBACK_VERIFIED"&&r.getString("readbackSha256")==e.sha256)
            val bytes=readMap(e.identity.getString("mapId"))
            GoviewArtifact.verify(bytes,e.identity.getString("mapId"),e.identity.getInt("version"),e.sha256)
            require(bytes.contentEquals(e.payload.toByteArray(Charsets.UTF_8)))
            JSONObject().put("transferId",e.transferId).put("sha256",e.sha256).put("operation","UPDATE").put("status","SAVED")
                .put("revision",e.identity.getInt("version")).put("readbackVerified",true)
        }
        // A lost response may be retried with this identical report. Never calls preview/save/Update.
        val ack=JSONObject(transport.receipt(id,body.toString()))
        require(ack.keys().asSequence().toSet()==body.keys().asSequence().toSet()&&body.keys().asSequence().all {key->
            if(key=="revision")ack.get(key) is Number&&ack.get(key).toString()==body.get(key).toString() else ack.get(key)==body.get(key)
        })
        synchronized(lock) {
            val e=local(id);val r=receipt(e)
            r.put("typedReportStatus","REMOTE_RECEIPT_READBACK_VERIFIED").put("typedReportedAt",System.currentTimeMillis())
            atomic(receiptFile(id),r.toString())
        }
        // This reports the saved artifact checked before dispatch; it does not assert a future current map.
        return ack
    }
}
