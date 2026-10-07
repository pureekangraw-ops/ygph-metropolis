package com.big.gobrowser.outsideview

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

class MapStateStore(private val root:File){
    constructor(context:Context):this(File(context.filesDir,"outside-view"))
    private val journalFile:File get()=File(root,"journal.json")
    fun load():MapJournal{if(!journalFile.isFile)return MapJournal(MapState());return runCatching{decode(JSONObject(journalFile.readText()))}.getOrElse{MapJournal(MapState())}}
    @Synchronized fun commit(journal:MapJournal){require(journal.version==1);root.mkdirs();val tmp=File(root,"journal.json.tmp");java.io.FileOutputStream(tmp).use{stream->stream.write(encode(journal).toString().toByteArray(Charsets.UTF_8));stream.fd.sync()};try{Files.move(tmp.toPath(),journalFile.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING)}catch(e:Exception){tmp.delete();throw IllegalStateException("atomic journal replacement unavailable",e)}}
    /** Called only for the renderer's completed screen/retry frame, never transport acceptance. */
    @Synchronized fun confirmScreen(c:RenderConfirmation):Boolean {
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
        return JSONObject().put("version",j.version).put("state",state).put("hashes",hashes).put("receipts",receipts).put("pending",pending).put("renderedRevision",j.renderedRevision)
    }
    private fun stringOrNull(o:JSONObject,key:String):String?=if(o.isNull(key))null else o.optString(key,"")
    private fun decode(o:JSONObject):MapJournal{
        require(o.optInt("version",1)==1)
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
        return MapJournal(state,pending,hashes,receipts,renderedRevision=renderedRevision)
    }
}
