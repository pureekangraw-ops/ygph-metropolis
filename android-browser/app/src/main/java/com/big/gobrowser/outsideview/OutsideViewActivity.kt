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
import com.big.gobrowser.ui.*
import com.big.gobrowser.browser.GeckoBrowserActivity
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
    private lateinit var sharingStatus:TextView
    private lateinit var gpsStatus:TextView
    private lateinit var location:ForegroundLocationController
    private var foreground=false
    private val statusTick=object:Runnable {override fun run(){if(foreground){updateSharingStatus();handler.postDelayed(this,30_000)}}}
    private val handler=Handler(Looper.getMainLooper())
    private val worker=Executors.newSingleThreadExecutor()
    private val commands=java.util.ArrayDeque<MapCommand>()
    private lateinit var mapShare:ObservatoryMapShare
    private lateinit var shareButton:Button
    private var busy=false
    private var destroyed=false
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        store=MapStateStore(this);packageStore=LocalMapPackageStore(this)
        val root=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;setPadding(12,8,12,8)}
        root.addView(ObservatoryTheme.title(this,"หอดูดาว · แผนที่"))
        root.addView(ObservatoryBuildStamp.view(this))
        status=ObservatoryTheme.status(this).apply {text="กดค้างบนแผนที่เพื่อบันทึกจุด"}
        sharingStatus=ObservatoryTheme.status(this);root.addView(sharingStatus)
        gpsStatus=ObservatoryTheme.status(this).apply {text="ตำแหน่งฉัน · กดเพื่อใช้ GPS จากเครื่อง"}
        root.addView(status)
        val tools=LinearLayout(this)
        tools.addView(button("ไลร่า"){LyraDialog.show(this,"OUTSIDE"){context()}})
        tools.addView(button("บันทึกจุด"){renderer.center()?.let(::pinDialog)})
        tools.addView(button("จุดของฉัน"){listPins()})
        tools.addView(button("ส่งแผนที่ให้ GO"){shareMapToGo()})
        tools.addView(button("เชื่อมต่อ PANTHEON"){startActivity(Intent(this,GeckoBrowserActivity::class.java))})
        tools.addView(button("ส่งภาพแผนที่"){shareVisibleMapImage()})
        shareButton=button("ส่งแผนที่เข้า PANTHEON"){mapShare.captureOnce();updateSharingStatus()}
        tools.addView(shareButton)
        tools.addView(button("เก็บช่วงนี้"){ObservatoryMemoryDialog.preserve(this,"map",currentMapHandoff())})
        tools.addView(button("ที่เก็บไว้"){ObservatoryMemoryDialog.saved(this)})
        tools.addView(button("กลับ"){finish()})
        root.addView(scroll(tools))
        val files=LinearLayout(this)
        files.addView(button("นำเข้า PMTiles"){startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),40)})
        files.addView(button("ลองแสดงใหม่"){renderer.reloadStyle()})
        files.addView(button("โน้ต"){noteDialog("outside","พื้นที่นี้")})
        files.addView(button("ตำแหน่งฉัน"){location.request()})
        root.addView(scroll(files))
        root.addView(gpsStatus)
        val host=FrameLayout(this);root.addView(host,LinearLayout.LayoutParams(-1,0,1f))
        root.addView(TextView(this).apply {text=packageStore.active()?.attribution?:"© OpenStreetMap contributors · openstreetmap.org/copyright";textSize=12f;setOnClickListener {startActivity(Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://www.openstreetmap.org/copyright")))}})
        ObservatoryTheme.apply(this,root)
        PhoneLayout.fitSystemBars(root)
        setContentView(root)
        renderer=MapLibreOutsideRenderer(host,packageStore)
        executor=MapCommandExecutor(store,renderer,ExecutionScope.LOCAL_OWNER)
        mapShare=ObservatoryMapShare(this,store,{foreground&&renderer.foregroundReady&&store.load().let {it.pending==null&&it.renderedRevision==it.state.revision}},{message->status.text=message;updateSharingStatus()},{renderer.cameraSnapshot()})
        location=ForegroundLocationController(this,{fix->renderer.showLocation(fix?.let {Point(it.longitude,it.latitude)})},{gpsStatus.text=it})
        location.onCenter={point->if(!renderer.centerOnLocation(point))gpsStatus.text="แผนที่กำลังทำงาน · กดตำแหน่งฉันอีกครั้งเมื่อพร้อม"}
        renderer.onSelect=::pinDialog
        renderer.onError={status.text=it}
        renderer.onConfirmed={confirmation->
            if(confirmation.commandId.startsWith("screen-"))store.confirmScreen(confirmation)
            else {busy=false;status.text=if(confirmation.error==null)"บันทึกบนแผนที่แล้ว · ${confirmation.revision}" else "แสดงแผนที่ไม่สำเร็จ: ${confirmation.error}";pump()}
        }
        renderer.onReady={val journal=store.load();store.commit(journal.copy(renderedRevision=-1));if(store.load().pending!=null){busy=true;executor.resume()}else{renderer.render(RenderRequest("screen-${UUID.randomUUID()}",store.load().state.revision,renderer.styleGeneration,"screen",store.load().state)){};pump()}}
    }
    private fun enqueue(vararg commands:MapCommand){commands.forEach {this.commands.addLast(it)};pump()}
    private fun pump(){
        if(busy||commands.isEmpty()||!renderer.foregroundReady)return
        busy=true
        val command=commands.removeFirst()
        val receipt=executor.submit(command)
        if(receipt.status!=MapReceiptStatus.PENDING){
            busy=false
            status.text="${receipt.status}: ${receipt.reason ?: ""}"
            pump()
        }
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
    private fun updateSharingStatus(){
        if(!::mapShare.isInitialized||!::sharingStatus.isInitialized)return
        val journal=store.load()
        val recent=mapShare.lastAck?.let {System.currentTimeMillis()-it in 0..14_999}==true
        val fresh=recent&&renderer.foregroundReady&&journal.renderedRevision==journal.state.revision&&mapShare.acknowledgedRevision==journal.state.revision
        val state=SharingStatus.resolve(mapShare.sharing,mapShare.isPaired(),foreground,ObservatoryTheme.online(this),fresh,mapShare.lastAck,mapShare.deliveryFailed,System.currentTimeMillis())
        sharingStatus.text=state.label
        sharingStatus.setTextColor(if(state==SharingState.LIVE)ObservatoryTheme.lime else ObservatoryTheme.muted)
    }
    /** Shares explicit map evidence with the Android chooser; no background or secret transfer. */
    /** Real, owner-confirmed map-image handoff. Nothing is posted to a server automatically. */
    private fun shareVisibleMapImage() {
        if (!foreground || !renderer.foregroundReady) { status.text = "ภาพแผนที่ยังไม่พร้อม"; return }
        AlertDialog.Builder(this).setTitle("ส่งภาพแผนที่ให้ GO")
            .setMessage("ส่งภาพแผนที่ที่กำลังแสดง รวมถึงรายละเอียดตำแหน่งที่มองเห็น ผ่านแอปที่บิ๊กเลือกเท่านั้น")
            .setNegativeButton("ยกเลิก", null)
            .setPositiveButton("ถ่ายภาพและเลือกแอป") { _, _ ->
                renderer.snapshotBitmap { bitmap ->
                    if (bitmap == null) { status.text = "ยังจับภาพแผนที่ไม่ได้"; return@snapshotBitmap }
                    worker.execute {
                        val result = runCatching {
                            val folder = java.io.File(cacheDir, "observatory_share").apply { mkdirs() }
                            val file = java.io.File(folder, "observatory-map.png")
                            java.io.FileOutputStream(file).use { output ->
                                check(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output)) { "PNG_WRITE_FAILED" }
                            }
                            androidx.core.content.FileProvider.getUriForFile(
                                this, "${packageName}.fileprovider", file
                            )
                        }
                        handler.post {
                            if (!destroyed && foreground) result.onSuccess { uri ->
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "image/png"
                                    putExtra(Intent.EXTRA_STREAM, uri)
                                    putExtra(Intent.EXTRA_TEXT, "YGG Observatory map snapshot · © OpenStreetMap contributors")
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    clipData = android.content.ClipData.newUri(contentResolver, "Observatory map", uri)
                                }
                                startActivity(Intent.createChooser(send, "แชร์ภาพแผนที่ให้ GO"))
                            }.onFailure { status.text = "เตรียมภาพแผนที่ไม่สำเร็จ" }
                        }
                    }
                }
            }.show()
    }

    private fun currentMapHandoff(): String {
        val journal = store.load()
        val state = journal.state
        val pins = JSONArray()
        state.pins.values.take(100).forEach { pin ->
            pins.put(JSONObject().put("name", pin.label.take(100))
                .put("latitude", pin.point.latitude).put("longitude", pin.point.longitude)
                .put("source", pin.evidence.source ?: JSONObject.NULL))
        }
        val evidence = JSONObject()
            .put("schema", "observatory.map.handoff.v1")
            .put("viewport", renderer.cameraSnapshot())
            .put("revision", state.revision)
            .put("renderedRevision", journal.renderedRevision)
            .put("pinCount", state.pins.size)
            .put("pins", pins)
            .put("truncated", state.pins.size > 100)
            .put("note", "Camera and saved pins only; not a live map image or GPS proof")
        return "YGG OBSERVATORY — MAP EVIDENCE (owner-shared)\\n" + evidence.toString(2)
    }

    private fun shareMapToGo() {
        if (!foreground) { status.text = "เปิดหน้าแผนที่ก่อนแชร์"; return }
        val handoff = currentMapHandoff()
        AlertDialog.Builder(this).setTitle("ส่งแผนที่ให้ GO")
            .setMessage("แชร์ตำแหน่งกล้องแผนที่และหมุดที่บันทึกไว้ (สูงสุด 100 จุด) ผ่านเมนูแชร์ของ Android\\nพิกัดอาจเป็นข้อมูลส่วนตัว")
            .setNegativeButton("ยกเลิก", null)
            .setPositiveButton("เลือกแอปเพื่อแชร์") { _, _ ->
                startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"; putExtra(Intent.EXTRA_TEXT, handoff)
                }, "แชร์แผนที่ให้ GO"))
            }.show()
    }


    private fun button(label:String,action:()->Unit)=ObservatoryTheme.button(this,label,action)
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==ForegroundLocationController.REQUEST_CODE)location.permissionResult()}
    private fun scroll(row:LinearLayout)=HorizontalScrollView(this).apply {isHorizontalScrollBarEnabled=false;addView(row,ViewGroup.LayoutParams(-2,-2))}
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);val uri=data?.data?:return;if(requestCode==40&&resultCode==RESULT_OK){status.text="กำลังนำเข้าแผนที่…";worker.execute {val result=runCatching {packageStore.import(uri)};handler.post {if(!destroyed)result.onSuccess {renderer.reloadStyle();status.text="นำเข้า ${it.attribution}"}.onFailure {status.text="นำเข้าไม่ได้: ${it.message}"}}}}}
    override fun onStart(){super.onStart();renderer.onStart()}
    override fun onResume(){super.onResume();foreground=true;busy=store.load().pending!=null;renderer.onResume();location.resume();handler.post(statusTick);updateSharingStatus()}
    override fun onPause(){foreground=false;handler.removeCallbacks(statusTick);location.pause();mapShare.stop();renderer.onPause();updateSharingStatus();super.onPause()}
    override fun onStop(){renderer.onStop();super.onStop()}
    override fun onDestroy(){destroyed=true;handler.removeCallbacks(statusTick);location.pause();mapShare.close();worker.shutdownNow();renderer.onDestroy();super.onDestroy()}
    override fun onLowMemory(){super.onLowMemory();renderer.onLowMemory()}
    override fun onSaveInstanceState(outState:Bundle){super.onSaveInstanceState(outState);renderer.onSaveInstanceState(outState)}
}

