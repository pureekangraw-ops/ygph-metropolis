package com.big.gobrowser.outsideview

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.*
import android.view.ViewGroup
import com.big.gobrowser.lyra.LyraDialog
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

class OutsideViewActivity : Activity() {
    private lateinit var store:MapStateStore
    private lateinit var renderer:MapLibreOutsideRenderer
    private lateinit var executor:MapCommandExecutor
    private lateinit var packageStore:LocalMapPackageStore
    private lateinit var status:TextView
    private val handler=Handler(Looper.getMainLooper())
    private val worker=Executors.newSingleThreadExecutor()
    private val commands=java.util.ArrayDeque<MapCommand>()
    private lateinit var relay:MapRelayTransport
    private lateinit var shareButton:Button
    private val remote=mutableMapOf<String,MapRelayEnvelope>()
    private var busy=false
    private var destroyed=false
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        store=MapStateStore(this);packageStore=LocalMapPackageStore(this)
        val root=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;setPadding(12,8,12,8)}
        root.addView(TextView(this).apply {text="หอดูดาว · แผนที่";textSize=20f})
        status=TextView(this).apply {text="กดค้างบนแผนที่เพื่อบันทึกจุด"}
        root.addView(status)
        val tools=LinearLayout(this)
        tools.addView(button("ไลร่า"){LyraDialog.show(this,"OUTSIDE"){context()}})
        tools.addView(button("บันทึกจุด"){renderer.center()?.let(::pinDialog)})
        tools.addView(button("จุดของฉัน"){listPins()})
        shareButton=button("แชร์ให้โก"){if(relay.sharing){relay.stop();discardRemoteQueue();shareButton.text="แชร์ให้โก"}else if(relay.start())shareButton.text="หยุดแชร์"}
        tools.addView(shareButton)
        tools.addView(button("กลับ"){finish()})
        root.addView(scroll(tools))
        val files=LinearLayout(this)
        files.addView(button("นำเข้า PMTiles"){startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),40)})
        files.addView(button("โน้ต"){noteDialog("outside","พื้นที่นี้")})
        root.addView(scroll(files))
        val host=FrameLayout(this);root.addView(host,LinearLayout.LayoutParams(-1,0,1f))
        root.addView(TextView(this).apply {text=packageStore.active()?.attribution?:"© OpenStreetMap contributors · openstreetmap.org/copyright";textSize=12f;setOnClickListener {startActivity(Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://www.openstreetmap.org/copyright")))}})
        setContentView(root)
        renderer=MapLibreOutsideRenderer(host,packageStore)
        executor=MapCommandExecutor(store,renderer,ExecutionScope.LOCAL_OWNER)
        relay=MapRelayTransport(this,store,{renderer.foregroundReady}, { envelope->
            if(remote.size<100&&commands.size<100){remote[envelope.command.commandId]=envelope;commands.addLast(envelope.command);pump()}else status.text="คิวคำสั่งแผนที่เต็ม"
        }, {status.text=it})
        renderer.onSelect=::pinDialog
        renderer.onError={status.text=it}
        renderer.onConfirmed={confirmation->if(!confirmation.commandId.startsWith("screen-")){busy=false;status.text="บันทึกบนแผนที่แล้ว · ${confirmation.revision}";remote.remove(confirmation.commandId)?.let {e->store.load().receipts[confirmation.commandId]?.let {relay.completed(e,it)}};pump()}}
        renderer.onReady={if(store.load().pending!=null){busy=true;executor.resume()}else{renderer.render(RenderRequest("screen-${UUID.randomUUID()}",store.load().state.revision,renderer.styleGeneration,"screen",store.load().state)){};pump()}}
    }
    private fun enqueue(vararg commands:MapCommand){commands.forEach {this.commands.addLast(it)};pump()}
    private fun discardRemoteQueue(){val ids=remote.keys.toSet();commands.removeAll {it.commandId in ids};remote.clear()}
    private fun pump(){
        if(busy||commands.isEmpty()||!renderer.foregroundReady)return
        val c=commands.removeFirst();val envelope=remote[c.commandId]
        if(envelope!=null){
            val rejection=relay.rejection(envelope)
            if(rejection!=null){status.text="ปฏิเสธคำสั่งเมโทร: $rejection";if(relay.started(envelope))relay.completed(envelope,MapReceipt(c.commandId,MapReceiptStatus.REJECTED,rejection,store.load().state.revision));remote.remove(c.commandId);pump();return}
            if(!relay.started(envelope)){status.text="บันทึกคำสั่งเมโทรไม่ได้หรือ payload เปลี่ยน";remote.remove(c.commandId);pump();return}
            // Journal owns command dedupe. A terminal receipt is returned without executing again.
            val existing=store.load().receipts[c.commandId]
            if(existing!=null){remote.remove(c.commandId);relay.completed(envelope,existing);pump();return}
        }
        busy=true;val r=executor.submit(c)
        if(r.status!=MapReceiptStatus.PENDING){busy=false;status.text="${r.status}: ${r.reason}";remote.remove(c.commandId)?.let {relay.completed(it,r)};pump()}
    }
    private fun pinDialog(point:Point) {
        val name=EditText(this).apply {hint="ชื่อจุด"}
        AlertDialog.Builder(this).setTitle("บันทึกจุด ${"%.5f".format(point.latitude)}, ${"%.5f".format(point.longitude)}").setView(name).setNegativeButton("ยกเลิก",null).setPositiveButton("บันทึก"){_,_->
            val label=name.text.toString().trim();if(label.isBlank())return@setPositiveButton
            val delta=.005;val b=Bounds((point.longitude-delta).coerceAtLeast(-180.0),(point.latitude-delta).coerceAtLeast(-90.0),(point.longitude+delta).coerceAtMost(180.0),(point.latitude+delta).coerceAtMost(90.0))
            val zoneId="owner-area:${UUID.randomUUID()}";val grid=Grid(gridId(zoneId,b),zoneId,b)
            val now=System.currentTimeMillis();val pin=Pin("pin:${UUID.randomUUID()}",label,point,grid.id,Evidence(EvidenceStatus.VERIFIED,"owner-map-selection",now,null),zoneId)
            // Owner chose this map coordinate; this is not a GPS fix or an inferred destination.
            enqueue(MapCommand("zone:${UUID.randomUUID()}",MapAction.UPSERT_ZONE,zone=Zone(zoneId,label,b)),MapCommand("grid:${UUID.randomUUID()}",MapAction.UPSERT_GRID,grid=grid),MapCommand("pin:${UUID.randomUUID()}",MapAction.UPSERT_PIN,pin=pin))
        }.show()
    }
    private fun listPins(){val pins=store.load().state.pins.values.toList();if(pins.isEmpty()){status.text="ยังไม่มีจุดที่บันทึก";return};AlertDialog.Builder(this).setTitle("จุดของฉัน").setItems(pins.map {it.label}.toTypedArray()){_,i->val pin=pins[i];AlertDialog.Builder(this).setTitle(pin.label).setItems(arrayOf("ดูบนแผนที่","เปิดนำทาง","เพิ่มโน้ต","ลบจุด")){_,a->when(a){0->enqueue(MapCommand("focus:${UUID.randomUUID()}",MapAction.FOCUS,MapTarget(pin.id,"pin")));1->status.text=if(PinNavigation.launch(this,pin)==NavigationResult.HANDOFF_STARTED)"เปิดแอปนำทางแล้ว" else "ไม่มีแอปนำทางที่รองรับ";2->noteDialog(pin.id,pin.label);3->enqueue(MapCommand("remove:${UUID.randomUUID()}",MapAction.REMOVE,MapTarget(pin.id,"pin")))}}.show()}.show()}
    private fun noteDialog(id:String,label:String){val value=EditText(this).apply {setText(store.load().state.notes[id].orEmpty())};AlertDialog.Builder(this).setTitle("โน้ต · $label").setView(value).setNegativeButton("ยกเลิก",null).setPositiveButton("บันทึก"){_,_->enqueue(MapCommand("note:${UUID.randomUUID()}",MapAction.NOTE,MapTarget(id,"map"),note=value.text.toString().take(4000)))}.show()}
    fun context():JSONObject {
        val state=store.load().state
        val pins=JSONArray();state.pins.values.take(32).forEach {pins.put(JSONObject().put("id",it.id).put("label",it.label).put("longitude",it.point.longitude).put("latitude",it.point.latitude).put("source",it.evidence.source))}
        val center=renderer.center()
        return JSONObject().put("mapSummary",JSONObject().put("revision",state.revision).put("pins",pins).put("notes",JSONObject(state.notes as Map<*,*>)).put("center",center?.let {JSONObject().put("longitude",it.longitude).put("latitude",it.latitude)}?:JSONObject.NULL))
    }
    private fun button(label:String,action:()->Unit)=Button(this).apply {text=label;minWidth=0;setOnClickListener {action()}}
    private fun scroll(row:LinearLayout)=HorizontalScrollView(this).apply {isHorizontalScrollBarEnabled=false;addView(row,ViewGroup.LayoutParams(-2,-2))}
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);val uri=data?.data?:return;if(requestCode==40&&resultCode==RESULT_OK){status.text="กำลังนำเข้าแผนที่…";worker.execute {val result=runCatching {packageStore.import(uri)};handler.post {if(!destroyed)result.onSuccess {renderer.reloadStyle();status.text="นำเข้า ${it.attribution}"}.onFailure {status.text="นำเข้าไม่ได้: ${it.message}"}}}}}
    override fun onStart(){super.onStart();renderer.onStart()}
    override fun onResume(){super.onResume();busy=store.load().pending!=null;renderer.onResume()}
    override fun onPause(){relay.stop();discardRemoteQueue();shareButton.text="แชร์ให้โก";renderer.onPause();super.onPause()}
    override fun onStop(){renderer.onStop();super.onStop()}
    override fun onDestroy(){destroyed=true;relay.close();worker.shutdownNow();renderer.onDestroy();super.onDestroy()}
    override fun onLowMemory(){super.onLowMemory();renderer.onLowMemory()}
    override fun onSaveInstanceState(outState:Bundle){super.onSaveInstanceState(outState);renderer.onSaveInstanceState(outState)}
}
