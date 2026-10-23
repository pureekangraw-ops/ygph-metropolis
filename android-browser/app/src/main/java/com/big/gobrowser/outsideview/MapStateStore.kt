package com.big.gobrowser.outsideview

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

class MapStateStore(private val root:File,private val backend:JournalBackend?=null){
    constructor(context:Context):this(File(context.filesDir,"outside-view"))
    private val journalFile:File get()=File(root,"journal.json")
    /** All store instances for one journal share the same process-wide transaction boundary. */
    internal val transactionLock:Any = journalLocks.computeIfAbsent(journalFile.canonicalPath) { Any() }
    companion object {
        private val journalLocks=java.util.concurrent.ConcurrentHashMap<String,Any>()
    }
    fun load():MapJournal = synchronized(transactionLock) {readStrict()}
    /** One transaction in the original journal. Fail closed on unreadable existing data. */
    fun importGeoJson(batch: GeoJsonBatch):Int = importGeoJsonWithReceipt(batch).added
    fun importGeoJsonWithReceipt(batch:GeoJsonBatch):MapUpdateReceipt = synchronized(transactionLock) {
        val before=readStrict()
        val after=GeoJsonImport.merge(before,batch)
        val added=after.state.pins.size-before.state.pins.size
        val receipt=MapUpdateReceipt(java.util.UUID.randomUUID().toString(),batch.packageId,batch.packageVersion,
            if(after.state==before.state) "DUPLICATE" else "SAVED",after.state.revision,added)
        commit(withReceipt(after,receipt))
        receipt
    }
    /** Receipt for a local file read. No pins are committed by this phase. */
    fun receiveFile(batch:GeoJsonBatch,correlationId:String):MapUpdateReceipt = synchronized(transactionLock) {
        val journal=readStrict()
        val receipt=MapUpdateReceipt(java.util.UUID.randomUUID().toString(),batch.packageId,batch.packageVersion,
            "FILE_RECEIVED",journal.state.revision,operation="DOWNLOAD",correlationId=correlationId)
        commit(withReceipt(journal,receipt));receipt
    }
    fun previewUpdate(batch:GeoJsonBatch,correlationId:String):MapUpdatePreview = synchronized(transactionLock) {
        val journal=readStrict()
        require(batch.baseVersion==null || batch.baseVersion==journal.state.revision){"Proposal baseVersion differs; request a fresh proposal"}
        val frozen=batch.copy(pins=batch.pins.toList(),ownerNotes=batch.ownerNotes.toMap())
        val after=GeoJsonImport.merge(journal,frozen)
        val added=after.state.pins.size-journal.state.pins.size
        MapUpdatePreview(correlationId,journal.state.revision,batch.packageVersion,added,batch.pins.size-added,frozen)
    }
    fun approveUpdate(preview:MapUpdatePreview):MapUpdateReceipt = synchronized(transactionLock) {
        val before=readStrict()
        require(before.state.revision==preview.expectedRevision){"Map changed since preview; review again"}
        val after=GeoJsonImport.merge(before,preview.batch)
        val receipt=MapUpdateReceipt(java.util.UUID.randomUUID().toString(),preview.batch.packageId,preview.packageVersion,
            if(after.state==before.state)"DUPLICATE" else "SAVED",after.state.revision,preview.added,
            operation="UPDATE",correlationId=preview.correlationId,readbackVerified=true)
        val expected=withReceipt(after,receipt)
        commit(expected)
        check(readStrict()==expected){"Commit outcome uncertain: readback failed; reopen receipts before retry"}
        receipt
    }
    fun recordPhaseFailure(operation:String,correlationId:String,message:String):MapUpdateReceipt = synchronized(transactionLock) {
        require(operation in setOf("SNAPSHOT","UPLOAD","DOWNLOAD","UPDATE","STORAGE"))
        val journal=readStrict()
        val receipt=MapUpdateReceipt(java.util.UUID.randomUUID().toString(),"unaccepted-input",1,"FAILED",journal.state.revision,
            error=message.take(512),operation=operation,correlationId=correlationId)
        commit(withReceipt(journal,receipt));receipt
    }
    fun selectedSnapshot(ids:Set<String>,expectedRevision:Long):SelectedSnapshot = synchronized(transactionLock) {
        val journal=readStrict()
        require(journal.state.revision==expectedRevision){"Map changed; select again"}
        require(ids.isNotEmpty() && ids.all {journal.state.pins.containsKey(it)}){"Select known pins explicitly"}
        val capture=java.util.UUID.randomUUID().toString()
        val selected=journal.copy(state=journal.state.copy(pins=journal.state.pins.filterKeys {it in ids}.mapValues {(_,pin)->pin.copy(gridId="",zoneId=null,note=null,evidence=Evidence(EvidenceStatus.UNKNOWN,"selected-owner-snapshot"))},notes=emptyMap()))
        val json=JSONObject(MapUpdatePackage.export(selected)).put("captureId",capture).put("capturedAtEpochMs",System.currentTimeMillis())
            .put("selection", "explicit-pins-only").toString()
        val receipt=MapUpdateReceipt(java.util.UUID.randomUUID().toString(),capture,journal.state.revision,"CAPTURED_LOCAL",journal.state.revision,
            operation="SNAPSHOT",correlationId=capture)
        commit(withReceipt(journal,receipt))
        SelectedSnapshot(capture,journal.state.revision,json,receipt)
    }
    private fun checksum(raw:String)=java.security.MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
    fun createBackup():String = synchronized(transactionLock) {writeBackup(readStrict())}
    private fun writeBackup(journal:MapJournal):String {
        val directory=File(root,"backups");check(directory.isDirectory || directory.mkdirs())
        val name="backup-${java.util.UUID.randomUUID()}.json"
        val payload=encode(journal).toString()
        val envelope=JSONObject().put("schemaVersion",1).put("sha256",checksum(payload)).put("payload",payload).toString()
        val temp=File(directory,"$name.tmp")
        java.io.FileOutputStream(temp).use {it.write(envelope.toByteArray(Charsets.UTF_8));it.fd.sync()}
        Files.move(temp.toPath(),File(directory,name).toPath(),StandardCopyOption.ATOMIC_MOVE)
        return name
    }
    fun backups():List<String> = synchronized(transactionLock) {File(root,"backups").listFiles()?.filter {it.isFile && it.name.matches(Regex("backup-[a-f0-9-]+\\.json"))}?.sortedByDescending {it.lastModified()}?.map {it.name}?:emptyList()}
    private fun readBackup(name:String):Pair<MapJournal,String> {
        require(name.matches(Regex("backup-[a-f0-9-]+\\.json"))){"Invalid backup name"}
        val file=File(File(root,"backups"),name)
        require(file.length()<=33_554_432){"Backup exceeds local limit"}
        val envelope=JSONObject(file.readText())
        require(envelope.get("schemaVersion").toString()=="1"){"Unsupported backup schema"}
        val payload=envelope.getString("payload");val hash=checksum(payload)
        require(hash==envelope.getString("sha256")){"Backup checksum mismatch"}
        return decode(JSONObject(payload)) to hash
    }
    fun previewRestore(name:String):BackupPreview = synchronized(transactionLock) {
        val journal=readStrict();require(journal.pending==null){"Wait for pending command"}
        val (backup,hash)=readBackup(name)
        require(backup.pending==null){"Backup contains pending command"}
        BackupPreview(name,journal.state.revision,backup.state.pins.size,hash)
    }
    fun approveRestore(preview:BackupPreview):MapUpdateReceipt = synchronized(transactionLock) {
        val current=readStrict()
        require(current.pending==null && current.state.revision==preview.expectedRevision){"Map changed; review restore again"}
        val (backup,hash)=readBackup(preview.name);require(hash==preview.checksum){"Backup changed since preview"}
        // Preserve all current data in a durable rollback copy before applying an explicitly approved full restore.
        val rollback=writeBackup(current)
        val revision=current.state.revision+1
        val receipt=MapUpdateReceipt(java.util.UUID.randomUUID().toString(),preview.name,1,"RESTORED",revision,
            error="Rollback copy: $rollback",operation="STORAGE",readbackVerified=true)
        val restored=withReceipt(backup.copy(state=backup.state.copy(revision=revision),renderedRevision=-1,updates=current.updates),receipt)
        commit(restored);check(readStrict()==restored){"Restore readback failed; inspect rollback copy"};receipt
    }
    private fun readStrict():MapJournal {
        backend?.read()?.let {return decode(JSONObject(it))}
        val raw=if(journalFile.isFile)journalFile.readText() else encode(MapJournal(MapState())).toString()
        val journal=decode(JSONObject(raw))
        backend?.initialize(raw,journal.state.revision,journalFile.takeIf {it.isFile})
        return journal
    }
    private fun withReceipt(journal:MapJournal,receipt:MapUpdateReceipt):MapJournal {
        require(journal.updates.size<1000){"Update receipt limit reached; existing records preserved"}
        return journal.copy(updates=journal.updates+receipt)
    }
    fun recordImportFailure(message:String):MapUpdateReceipt = synchronized(transactionLock) {
        val journal=readStrict()
        val receipt=MapUpdateReceipt(java.util.UUID.randomUUID().toString(),"unaccepted-input",1,"REJECTED",journal.state.revision,error=message.take(512))
        commit(withReceipt(journal,receipt));receipt
    }
    fun exportGeoJson():String = synchronized(transactionLock) {MapUpdatePackage.export(readStrict())}
    fun editOwnerPin(id:String,label:String,point:Point,fieldConfirmed:Boolean,expectedRevision:Long):MapUpdateReceipt = synchronized(transactionLock) {
        val journal=readStrict()
        require(journal.pending==null && journal.state.revision==expectedRevision){"Map changed; reopen edit before saving"}
        require(label.isNotBlank() && label.length<=256)
        val original=requireNotNull(journal.state.pins[id]){"Pin missing"}
        val evidence=if(!fieldConfirmed && point==original.point)original.evidence else Evidence(
            if(fieldConfirmed)EvidenceStatus.VERIFIED else EvidenceStatus.UNKNOWN,
            if(fieldConfirmed)"owner-field-confirmation" else "owner-field-edit",System.currentTimeMillis())
        val edited=original.copy(label=label,point=point,evidence=evidence,
            gridId=original.gridId.takeIf {journal.state.grids[it]?.bounds?.contains(point)==true}.orEmpty())
        val next=journal.copy(state=journal.state.copy(pins=journal.state.pins+(id to edited),revision=journal.state.revision+1),renderedRevision=-1)
        val receipt=MapUpdateReceipt(java.util.UUID.randomUUID().toString(),"owner-field-edit",next.state.revision,"SAVED",next.state.revision,changed=1)
        commit(withReceipt(next,receipt));receipt
    }
    fun commit(journal:MapJournal):Unit = synchronized(transactionLock) {require(journal.version==1);if(backend!=null){readStrict();backend.write(encode(journal).toString(),journal.state.revision);return@synchronized};if(journalFile.isFile)decode(JSONObject(journalFile.readText()));root.mkdirs();val tmp=File(root,"journal.json.tmp");java.io.FileOutputStream(tmp).use{stream->stream.write(encode(journal).toString().toByteArray(Charsets.UTF_8));stream.fd.sync()};try{Files.move(tmp.toPath(),journalFile.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING)}catch(e:Exception){tmp.delete();throw IllegalStateException("atomic journal replacement unavailable",e)};Unit}
    /** Screen recreation must read and update the journal in the same shared transaction. */
    fun prepareScreen():MapJournal = synchronized(transactionLock) {
        val journal=load()
        commit(journal.copy(renderedRevision=-1))
        journal
    }
    /** Called only for the renderer's completed screen/retry frame, never transport acceptance. */
    fun confirmScreen(c:RenderConfirmation):Boolean = synchronized(transactionLock) {
        val j=load()
        if(!c.commandId.startsWith("screen-")||c.token!="screen"||c.error!=null||c.revision!=j.state.revision||j.pending!=null)return false
        commit(j.copy(renderedRevision=c.revision));return true
    }
    private fun stringOrNull(v:String?):Any=if(v==null)JSONObject.NULL else v
    private fun longOrNull(v:Long?):Any=if(v==null)JSONObject.NULL else v
    private fun encode(j:MapJournal):JSONObject{
        val state=JSONObject().put("revision",j.state.revision)
        val zones=JSONArray();j.state.zones.values.forEach{z->zones.put(MapCommandCodec.encode(MapCommand("_",MapAction.UPSERT_ZONE,zone=z)).getJSONObject("zone"))}
        val grids=JSONArray();j.state.grids.values.forEach{g->grids.put(MapCommandCodec.encode(MapCommand("_",MapAction.UPSERT_GRID,grid=g)).getJSONObject("grid"))}
        val pins=JSONArray();j.state.pins.values.forEach{p->pins.put(MapCommandCodec.encode(MapCommand("_",MapAction.UPSERT_PIN,pin=p)).getJSONObject("pin"))}
        val notes=JSONObject();j.state.notes.forEach{(k,v)->notes.put(k,v)}
        val recommendations=JSONArray();j.state.recommendations.forEach{recommendations.put(it)}
        val highlights=JSONArray();j.state.highlights.forEach{highlights.put(it)}
        state.put("zones",zones).put("grids",grids).put("pins",pins).put("notes",notes).put("recommendations",recommendations).put("highlights",highlights).put("focused",stringOrNull(j.state.focused))
        val hashes=JSONObject();j.hashes.forEach{(k,v)->hashes.put(k,v)}
        val receipts=JSONObject();j.receipts.forEach{(k,r)->val ids=JSONArray();r.confirmedFeatureIds.forEach{ids.put(it)};receipts.put(k,JSONObject().put("commandId",r.commandId).put("status",r.status.name).put("reason",stringOrNull(r.reason)).put("revision",r.revision).put("rendererToken",stringOrNull(r.rendererToken)).put("confirmedFeatureIds",ids).put("confirmedCamera",r.confirmedCamera?.let {JSONObject().put("longitude",it.longitude).put("latitude",it.latitude)}?:JSONObject.NULL).put("confirmedZoom",r.confirmedZoom?:JSONObject.NULL))}
        val pending=if(j.pending==null)JSONObject.NULL else JSONObject().put("command",MapCommandCodec.encode(j.pending.command)).put("revision",j.pending.revision).put("token",j.pending.token)
        val updates=JSONArray();j.updates.forEach {r->updates.put(JSONObject().put("id",r.id).put("packageId",r.packageId).put("packageVersion",r.packageVersion).put("status",r.status).put("revision",r.revision).put("added",r.added).put("changed",r.changed).put("error",r.error?:JSONObject.NULL).put("createdAt",r.createdAt).put("operation",r.operation).put("correlationId",r.correlationId).put("readbackVerified",r.readbackVerified))}
        return JSONObject().put("version",j.version).put("state",state).put("hashes",hashes).put("receipts",receipts).put("pending",pending).put("renderedRevision",j.renderedRevision).put("updates",updates)
    }
    private fun stringOrNull(o:JSONObject,key:String):String?=if(o.isNull(key))null else o.optString(key,"")
    private fun decode(o:JSONObject):MapJournal{
        require(!o.has("version") || o.get("version").toString()=="1"){"Unsupported journal schema"}
        val s=o.getJSONObject("state");val zones=linkedMapOf<String,Zone>();val grids=linkedMapOf<String,Grid>();val pins=linkedMapOf<String,Pin>()
        val zoneArray=s.optJSONArray("zones")?:JSONArray();for(i in 0 until zoneArray.length()){val command=MapCommandCodec.decode(JSONObject().put("commandId","_").put("action",MapAction.UPSERT_ZONE.name).put("zone",zoneArray.getJSONObject(i)));val value=requireNotNull(command.zone);zones[value.id]=value}
        val gridArray=s.optJSONArray("grids")?:JSONArray();for(i in 0 until gridArray.length()){val command=MapCommandCodec.decode(JSONObject().put("commandId","_").put("action",MapAction.UPSERT_GRID.name).put("grid",gridArray.getJSONObject(i)));val value=requireNotNull(command.grid);grids[value.id]=value}
        val pinArray=s.optJSONArray("pins")?:JSONArray();for(i in 0 until pinArray.length()){val command=MapCommandCodec.decode(JSONObject().put("commandId","_").put("action",MapAction.UPSERT_PIN.name).put("pin",pinArray.getJSONObject(i)));val value=requireNotNull(command.pin);pins[value.id]=value}
        val notes=mutableMapOf<String,String>();val noteObject=s.optJSONObject("notes");noteObject?.keys()?.forEach{key->notes[key]=noteObject.getString(key)}
        fun stringSet(key:String):Set<String>{val result=mutableSetOf<String>();val array=s.optJSONArray(key)?:JSONArray();for(i in 0 until array.length())result+=array.getString(i);return result}
        val state=MapState(zones,grids,pins,notes,stringSet("recommendations"),stringSet("highlights"),stringOrNull(s,"focused"),s.optLong("revision"))
        val hashes=mutableMapOf<String,String>();val hashObject=o.optJSONObject("hashes");hashObject?.keys()?.forEach{key->hashes[key]=hashObject.getString(key)}
        val receipts=mutableMapOf<String,MapReceipt>();val receiptObject=o.optJSONObject("receipts");receiptObject?.keys()?.forEach{key->val r=receiptObject.getJSONObject(key);val ids=mutableSetOf<String>();val array=r.optJSONArray("confirmedFeatureIds")?:JSONArray();for(i in 0 until array.length())ids+=array.getString(i);receipts[key]=MapReceipt(r.getString("commandId"),MapReceiptStatus.valueOf(r.getString("status")),stringOrNull(r,"reason"),r.optLong("revision"),stringOrNull(r,"rendererToken"),ids,r.optJSONObject("confirmedCamera")?.let {Point(it.getDouble("longitude"),it.getDouble("latitude"))},if(r.isNull("confirmedZoom"))null else r.getDouble("confirmedZoom"))}
        val pendingObject=o.optJSONObject("pending");val pending=if(pendingObject==null)null else PendingRender(MapCommandCodec.decode(pendingObject.getJSONObject("command")),pendingObject.getLong("revision"),pendingObject.getString("token"))
        val renderedRevision=if(o.has("renderedRevision"))o.getLong("renderedRevision") else receipts.values.firstOrNull {it.status==MapReceiptStatus.APPLIED&&it.revision==state.revision&&it.rendererToken!=null}?.revision?:-1L
        val updates=mutableListOf<MapUpdateReceipt>();val updateArray=o.optJSONArray("updates")?:JSONArray()
        for(i in 0 until updateArray.length()){val r=updateArray.getJSONObject(i);updates+=MapUpdateReceipt(r.getString("id"),r.getString("packageId"),r.getLong("packageVersion"),r.getString("status"),r.getLong("revision"),r.getInt("added"),r.getInt("changed"),stringOrNull(r,"error"),r.getLong("createdAt"),r.optString("operation","UPDATE"),r.optString("correlationId",r.getString("id")),r.optBoolean("readbackVerified",false))}
        return MapJournal(state,pending,hashes,receipts,renderedRevision=renderedRevision,updates=updates)
    }
}
