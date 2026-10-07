package com.big.gobrowser.outsideview

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import com.big.gobrowser.transport.ObservatoryStationConnection
import com.big.gobrowser.transport.StationHttp
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/** Explicit native sharing session. Server acceptance never stands for business completion. */
class MapRelayTransport(context:Context,private val store:MapStateStore,private val ready:()->Boolean,private val receive:(MapRelayEnvelope)->Unit,private val status:(String)->Unit,private val delivery:(Long?,Boolean)->Unit={_,_->}) {
    private val connection=ObservatoryStationConnection(context)
    private val prefs=context.getSharedPreferences("observatory-map-relay",Context.MODE_PRIVATE)
    private val power=context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private val handler=Handler(Looper.getMainLooper())
    private val worker=Executors.newSingleThreadExecutor()
    private var config:MapRelayConfiguration?=null
    private var token:String?=null
    @Volatile private var generation=0L
    private var epoch=0L
    private var sequence=0L
    private var inFlight=false
    @Volatile private var closed=false
    private val admitted=mutableMapOf<String,String>()
    @Volatile var sharing=false;private set
    var capture:MapRelayCapture?=null;private set
    private val loop=object:Runnable {override fun run(){if(sharing&&!closed){sync();handler.postDelayed(this,5000)}}}
    fun start():Boolean {
        if(sharing)return true
        val c=runCatching {MapRelayConfiguration.parse(requireNotNull(connection.config("map")))}.getOrNull()
        val t=connection.token()
        if(c==null||t.isNullOrBlank()){status("เชื่อมเมโทรจากหน้าบราวเซอร์ก่อนเปิดแชร์แผนที่");return false}
        config=c;token=t;generation++;epoch=maxOf(System.currentTimeMillis(),prefs.getLong("epoch",0)+1);sequence=0
        require(prefs.edit().putLong("epoch",epoch).commit()) {"MAP_EPOCH_PERSIST_FAILED"}
        capture=null;admitted.clear();sharing=true;delivery(null,false);status("เปิดแชร์แผนที่ให้ ${c.actor} · ${c.workId}");handler.post(loop);return true
    }
    fun stop() {
        if(!sharing)return
        sharing=false;generation++;handler.removeCallbacks(loop);capture=null;admitted.clear()
        val stoppedEpoch=epoch
        status("หยุดแชร์แผนที่แล้ว")
        worker.execute {runCatching {connection.stop("map",stoppedEpoch)}.onFailure {handler.post {if(!sharing&&!closed)status("หยุดแชร์ในเครื่องแล้ว · เมโทรยังไม่ยืนยันการหยุด: ${it.message}")}}}
    }
    fun close(){stop();closed=true;handler.removeCallbacks(loop);worker.shutdown()}
    fun rejection(e:MapRelayEnvelope):String? {
        val c=config?:return "NO_OWNER_CONNECTION"
        return MapRelayGuard.rejection(e,c,capture,System.currentTimeMillis(),sharing&&ready(),power.isInteractive)
    }
    /** Persist envelope and execution START before changing authoritative map state. */
    fun started(e:MapRelayEnvelope):Boolean {
        val old=record(e.command.commandId)
        if(old!=null&&old.getString("canonical")!=e.identity())return false
        if(old!=null)return true
        val records=records()
        if(records.length()>=100){val removable=records.keys().asSequence().firstOrNull {records.getJSONObject(it).optBoolean("sent",false)||records.getJSONObject(it).optLong("epoch")!=epoch}?:return false;records.remove(removable)}
        records.put(e.command.commandId,JSONObject().put("canonical",e.identity()).put("epoch",e.epoch).put("before",e.captureId).put("startedAt",System.currentTimeMillis()).put("sent",false))
        return saveRecords(records)
    }
    fun completed(e:MapRelayEnvelope,r:MapReceipt) {
        if(r.status==MapReceiptStatus.PENDING)return
        val record=record(e.command.commandId)?:return
        // A resumed old render remains local evidence; it cannot restore a stopped sharing epoch.
        if(record.getLong("epoch")!=epoch||!sharing){status("คืนผลแผนที่ในเครื่องแล้ว · ช่วงแชร์เดิมหยุดแล้ว");return}
        if(record.has("receipt")){sync();return}
        val after=if(r.status==MapReceiptStatus.APPLIED)buildSnapshot() else null
        if(r.status==MapReceiptStatus.APPLIED&&after==null){status("เฟรมยืนยันแล้ว แต่ snapshot ใหญ่เกินขนาด · ยังไม่ส่ง APPLIED");return}
        val readback=JSONObject().put("revision",r.revision).put("rendererToken",r.rendererToken?:JSONObject.NULL).put("confirmedFeatureIds",JSONArray(r.confirmedFeatureIds.toList())).put("confirmedCamera",r.confirmedCamera?.let {JSONObject().put("longitude",it.longitude).put("latitude",it.latitude).put("zoom",r.confirmedZoom?:JSONObject.NULL)}?:JSONObject.NULL).toString()
        val receipt=JSONObject().put("commandId",r.commandId).put("status",r.status.name).put("reason",r.reason?:JSONObject.NULL).put("beforeCaptureId",record.getString("before")).put("afterCaptureId",after?.getString("captureId")?:JSONObject.NULL).put("executedAtEpochMs",record.getLong("startedAt")).put("readback",readback).put("businessOutcome","UNKNOWN")
        record.put("receipt",receipt).put("after",after?:JSONObject.NULL)
        val records=records().put(r.commandId,record);if(!saveRecords(records)){status("บันทึก receipt ไม่สำเร็จ · ยังไม่ส่งผล");return};sync()
    }
    private fun records()=runCatching {JSONObject(prefs.getString("records","{}")!!)}.getOrElse {JSONObject()}
    private fun record(id:String)=records().optJSONObject(id)
    private fun saveRecords(records:JSONObject)=prefs.edit().putString("records",records.toString()).commit()
    private fun hasPendingReceipt(sessionEpoch:Long):Boolean {
        val ledger=records()
        return ledger.keys().asSequence().any {key->val record=ledger.getJSONObject(key);record.optLong("epoch")==sessionEpoch&&!record.optBoolean("sent")&&record.has("receipt")}
    }
    private fun buildSnapshot():JSONObject? {
        val c=config?:return null
        val j=store.load();if(j.pending!=null||j.renderedRevision!=j.state.revision||!ready()||!power.isInteractive)return null
        fun entries(key:String,commands:List<MapCommand>):JSONArray=JSONArray().also {a->commands.forEach {a.put(MapCommandCodec.encode(it).getJSONObject(key))}}
        val state=j.state
        val wire=JSONObject().put("zones",entries("zone",state.zones.values.map {MapCommand("_",MapAction.UPSERT_ZONE,zone=it)})).put("grids",entries("grid",state.grids.values.map {MapCommand("_",MapAction.UPSERT_GRID,grid=it)})).put("pins",entries("pin",state.pins.values.map {MapCommand("_",MapAction.UPSERT_PIN,pin=it)}))
        val notes=JSONArray();state.notes.forEach {(id,text)->notes.put(JSONObject().put("targetId",id).put("note",text))};wire.put("notes",notes)
        val now=System.currentTimeMillis();val id=UUID.randomUUID().toString()
        val snapshot=JSONObject().put("schema","observatory.map.snapshot.v1").put("deviceId",c.deviceId).put("captureId",id).put("revision",state.revision).put("epoch",epoch).put("sequence",++sequence).put("capturedAtEpochMs",now).put("workId",c.workId).put("checkpointId",c.checkpointId).put("state",wire).put("foreground",true).put("interactive",true)
        if(snapshot.toString().toByteArray(Charsets.UTF_8).size>49152)return null
        return snapshot
    }
    private fun sync() {
        if(!sharing||closed||inFlight||!ready()||!power.isInteractive)return
        val c=config?:return;val t=token?:return;val g=generation
        // Capture JSON on the native main thread, then perform only transport work off thread.
        val records=records();val pending=records.keys().asSequence().map {it to records.getJSONObject(it)}.firstOrNull {it.second.optLong("epoch")==epoch&&!it.second.optBoolean("sent")&&it.second.has("receipt")}
        val snapshot=if(pending!=null)pending.second.optJSONObject("after") else buildSnapshot()
        if(pending==null&&snapshot==null){status("ยังแชร์ไม่ได้: แผนที่ยังไม่ยืนยันเฟรมหรือ snapshot ใหญ่เกินขนาด");return}
        inFlight=true
        val hasCapture=capture!=null
        val sessionEpoch=epoch
        worker.execute {
            var didPublish=false
            val result=runCatching {
                fun active(){check(g==generation&&sharing&&!closed&&power.isInteractive) {"SHARING_SESSION_STOPPED"}}
                fun publish(){
                    if(snapshot==null)return
                    // A native frame can complete while polling. Its durable receipt takes priority
                    // over the idle refresh prepared before that poll.
                    if(pending==null&&hasPendingReceipt(sessionEpoch))return
                    active()
                    val ack=JSONObject(StationHttp.request(c.publishSnapshots,body=snapshot,token=t))
                    require(ack.getString("id")==snapshot.getString("captureId")) {"SNAPSHOT_ACK_MISMATCH"};didPublish=true
                }
                MapRelayExchange.run(hasCapture,pending!=null,::active,
                    poll={active();val a=JSONObject(StationHttp.request(c.pollCommands,"GET",token=t)).getJSONArray("commands");(0 until minOf(a.length(),100)).map {a.getJSONObject(it)}},
                    publish=::publish,
                    receipt={active();val entry=requireNotNull(pending);val ack=JSONObject(StationHttp.request(c.publishReceipts,body=entry.second.getJSONObject("receipt"),token=t));require(ack.getString("id")==entry.first) {"RECEIPT_ACK_MISMATCH"}})
            }
            handler.post {
                inFlight=false
                if(g!=generation||!sharing||closed)return@post
                result.onSuccess {commands->
                    if(didPublish)snapshot?.let {capture=MapRelayCapture(it.getString("captureId"),it.getLong("revision"),it.getLong("epoch"),it.getLong("capturedAtEpochMs"));delivery(System.currentTimeMillis(),false)}
                    if(pending!=null){val current=records();current.optJSONObject(pending.first)?.put("sent",true);saveRecords(current);admitted.remove(pending.first);status("เมโทรรับ receipt แล้ว · ผลงานธุรกิจ UNKNOWN");sync()}
                    else commands.forEach {raw->runCatching {MapRelayEnvelope.decode(raw)}.onSuccess {e->
                        val canonical=e.identity();val old=record(e.command.commandId)
                        if(old!=null&&old.getString("canonical")!=canonical){status("ปฏิเสธ command ID ที่เปลี่ยน payload");return@onSuccess}
                        if(old?.has("receipt")==true)return@onSuccess
                        if(admitted[e.command.commandId]==null){if(admitted.size>=100){status("คิวคำสั่งแผนที่เต็ม");return@onSuccess};admitted[e.command.commandId]=canonical;receive(e)}
                    }.onFailure {status("คำสั่งเมโทรไม่ตรงสัญญา: ${it.message}")}}
                }.onFailure {delivery(null,true);status("เมโทรยังไม่รับข้อมูลแผนที่: ${it.message}")}
                if(result.isSuccess&&pending==null&&hasPendingReceipt(sessionEpoch))sync()
            }
        }
    }
}
