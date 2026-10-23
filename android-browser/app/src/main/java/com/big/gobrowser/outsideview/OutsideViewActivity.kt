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
    private var importing=false
    private var busy=false
    @Volatile private var destroyed=false
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        store=MapStateStore(this);packageStore=LocalMapPackageStore(this)
        val root=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;setPadding(12,8,12,8)}
        root.addView(ObservatoryTheme.title(this,"หอดูดาว · GOVIEW"))
        root.addView(ObservatoryBuildStamp.view(this))
        status=ObservatoryTheme.status(this).apply {text="กดค้างบนแผนที่เพื่อบันทึกจุด"}
        sharingStatus=ObservatoryTheme.status(this);root.addView(sharingStatus)
        gpsStatus=ObservatoryTheme.status(this).apply {text="ตำแหน่งฉัน · กดเพื่อใช้ GPS จากเครื่อง"}
        root.addView(status)
        val tools=LinearLayout(this)
        tools.addView(button("บันทึกจุด"){renderer.center()?.let(::pinDialog)})
        tools.addView(button("จุดของฉัน"){listPins()})
        tools.addView(button("ตำแหน่งฉัน"){location.request()})
        tools.addView(button("เพิ่มเติม"){showMapTools()})
        root.addView(scroll(tools))
        shareButton=button("ส่งแผนที่เข้า PANTHEON"){mapShare.captureOnce();updateSharingStatus()}
        root.addView(shareButton)
        root.addView(gpsStatus)
        val host=FrameLayout(this);root.addView(host,LinearLayout.LayoutParams(-1,0,1f))
        root.addView(TextView(this).apply {text=packageStore.active()?.attribution?:"© OpenStreetMap contributors · openstreetmap.org/copyright";textSize=12f;setOnClickListener {startActivity(Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://www.openstreetmap.org/copyright")))}})
        ObservatoryTheme.apply(this,root)
        PhoneLayout.fitSystemBars(root)
        setContentView(root)
        renderer=MapLibreOutsideRenderer(host,packageStore,savedInstanceState)
        executor=MapCommandExecutor(store,renderer,ExecutionScope.LOCAL_OWNER)
        mapShare=ObservatoryMapShare(this,store,{foreground&&renderer.foregroundReady&&store.load().let {it.pending==null&&it.renderedRevision==it.state.revision}},{message->status.text=message;updateSharingStatus()},{renderer.cameraSnapshot()})
        location=ForegroundLocationController(this,{fix->renderer.showLocation(fix?.let {Point(it.longitude,it.latitude)})},{gpsStatus.text=it})
        location.onCenter={point->
            val receivedAt=android.os.SystemClock.elapsedRealtime()
            AlertDialog.Builder(this).setTitle("เลื่อนไปตำแหน่งฉัน")
                .setMessage("ถ้าไม่มี PMTiles ในเครื่อง แผนที่เดิมจะขอภาพถนนจาก OpenStreetMap สำหรับบริเวณนี้ ผู้ให้บริการจึงอาจทราบบริเวณตำแหน่งคุณ ยกเลิกเพื่อคงมุมมองเดิม")
                .setNegativeButton("ยกเลิก",null)
                .setPositiveButton("เลื่อนไปตำแหน่งฉัน"){_,_->
                    if(android.os.SystemClock.elapsedRealtime()-receivedAt>30_000)gpsStatus.text="ตำแหน่งเก่าแล้ว · กดตำแหน่งฉันเพื่อลองใหม่"
                    else if(!renderer.centerOnLocation(point))gpsStatus.text="แผนที่กำลังทำงาน · กดตำแหน่งฉันอีกครั้งเมื่อพร้อม"
                }.show()
        }
        renderer.onSelect=::pinDialog
        renderer.onError={status.text=it}
        renderer.onConfirmed=confirmed@{confirmation->
            if(destroyed)return@confirmed
            if(confirmation.commandId.startsWith("screen-")) {
                worker.execute {
                    val confirmed=runCatching {store.confirmScreen(confirmation)}
                    handler.post {
                        if(!destroyed && !importing && confirmation.styleGeneration==renderer.styleGeneration) {
                            busy=false
                            confirmed.onSuccess {accepted->
                                if(accepted)pump()
                                else if(confirmation.error==null)renderer.reloadStyle() // another Activity completed a newer transaction
                            }.onFailure {status.text="บันทึกข้อมูลแล้ว แต่ยืนยันภาพไม่ได้ · กดลองแสดงใหม่"}
                            updateSharingStatus()
                        }
                    }
                }
            }
            else {busy=false;status.text=if(confirmation.error==null)"บันทึกบนแผนที่แล้ว · ${confirmation.revision}" else "แสดงแผนที่ไม่สำเร็จ: ${confirmation.error}";pump()}
        }
        renderer.onReady=ready@{
            if(destroyed || importing)return@ready
            busy=true
            val generation=renderer.styleGeneration
            worker.execute {
                val loaded=runCatching {store.prepareScreen()}
                handler.post {
                    if(!destroyed && foreground && generation==renderer.styleGeneration) loaded.onSuccess {journal->
                        if(journal.pending!=null)executor.resume()
                        else renderer.render(RenderRequest("screen-${UUID.randomUUID()}",journal.state.revision,generation,"screen",journal.state)){}
                    }.onFailure {status.text="อ่านข้อมูลแผนที่ไม่ได้ · เก็บไฟล์เดิมไว้แล้ว"}
                }
            }
        }
    }
    private fun showMapTools() {
        val labels=arrayOf("ไลร่า", "ส่งแผนที่ให้ GO", "ส่งภาพแผนที่", "เชื่อมต่อ PANTHEON", "เก็บช่วงนี้", "ที่เก็บไว้", "นำเข้า PMTiles", "ลองแสดงใหม่", "โน้ต", "กลับ", "นำเข้า GeoJSON", "ค้นหาหมุด", "ชั้นข้อมูล", "ส่งออก GeoJSON · GOVIEW", "ผลอัปเดต GOVIEW")
        AlertDialog.Builder(this).setTitle("GOVIEW · เครื่องมือแผนที่").setItems(labels){_,choice->
            when(choice){
                0->LyraDialog.show(this,"OUTSIDE"){context()}
                1->shareMapToGo()
                2->shareVisibleMapImage()
                3->startActivity(Intent(this,GeckoBrowserActivity::class.java))
                4->ObservatoryMemoryDialog.preserve(this,"map",currentMapHandoff())
                5->ObservatoryMemoryDialog.saved(this)
                6->startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),40)
                7->renderer.reloadStyle()
                8->noteDialog("outside","พื้นที่นี้")
                9->finish()
                10->startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),42)
                11->searchPins()
                12->showLayers()
                13->startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/geo+json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"goview-map-update.geojson"),43)
                14->showUpdateReceipts()
            }
        }.setNegativeButton("ปิด",null).show()
    }
    private fun enqueue(vararg commands:MapCommand){commands.forEach {this.commands.addLast(it)};pump()}
    private fun pump(){
        if(importing||busy||commands.isEmpty()||!renderer.foregroundReady)return
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
    private fun listPins(query:String=""){val pins=store.load().state.pins.values.filter {it.label.contains(query,true)||it.note.orEmpty().contains(query,true)};if(pins.isEmpty()){status.text="ยังไม่มีจุดที่บันทึก";return};AlertDialog.Builder(this).setTitle("จุดของฉัน").setItems(pins.map {it.label}.toTypedArray()){_,i->val pin=pins[i];AlertDialog.Builder(this).setTitle(pin.label).setItems(arrayOf("ดูบนแผนที่","เปิดนำทาง","เพิ่มโน้ต","ลบจุด","ข้อมูลจากไฟล์","แก้ไข / ยืนยันหน้างาน")){_,a->when(a){0->enqueue(MapCommand("focus:${UUID.randomUUID()}",MapAction.FOCUS,MapTarget(pin.id,"pin")));1->status.text=if(PinNavigation.launch(this,pin)==NavigationResult.HANDOFF_STARTED)"เปิดแอปนำทางแล้ว" else "ไม่มีแอปนำทางที่รองรับ";2->noteDialog(pin.id,pin.label);3->enqueue(MapCommand("remove:${UUID.randomUUID()}",MapAction.REMOVE,MapTarget(pin.id,"pin")));4->AlertDialog.Builder(this).setTitle("ข้อมูลต้นทาง · ${pin.evidence.coordinate}").setMessage(pin.note?:pin.evidence.source.orEmpty()).setPositiveButton("ปิด",null).show();5->editPinDialog(pin.id)}}.show()}.show()}
    private fun searchPins() {
        val query=EditText(this).apply {hint="ชื่อหรือข้อมูลหมุด";isSingleLine=true}
        AlertDialog.Builder(this).setTitle("ค้นหาหมุด").setView(query).setNegativeButton("ยกเลิก",null)
            .setPositiveButton("ค้นหา"){_,_->listPins(query.text.toString())}.show()
    }
    private fun showLayers() {
        val ids=arrayOf("zone-fill","grid-lines","pin-dots")
        AlertDialog.Builder(this).setTitle("ชั้นข้อมูล").setMultiChoiceItems(arrayOf("พื้นที่","กริด","หมุด"),
            ids.map {renderer.layerVisible(it)}.toBooleanArray()){_,i,checked->renderer.setLayerVisible(ids[i],checked)}
            .setPositiveButton("ปิด",null).show()
    }
    private fun importGeoJson(uri:android.net.Uri) {
        if(busy || importing || commands.isNotEmpty()){status.text="รอแผนที่ทำงานเสร็จ แล้วนำเข้าใหม่";return}
        importing=true;busy=true
        status.text="GOVIEW · กำลังตรวจและบันทึก GeoJSON…"
        worker.execute {
            val saved=runCatching {
                val batch=contentResolver.openInputStream(uri).use {GeoJsonImport.parse(requireNotNull(it))}
                val receipt=store.importGeoJsonWithReceipt(batch)
                Pair(batch,receipt)
            }
            if(saved.isFailure)runCatching {store.recordImportFailure(saved.exceptionOrNull()?.message?:"Import failed")}
            if(!destroyed) handler.post {
                if(destroyed)return@post
                importing=false
                if(!destroyed) saved.onSuccess {(batch,receipt)->
                    val shown=GeoJsonImport.present({renderer.fitPoints(batch.pins.map {it.point})},{renderer.reloadStyle()})
                    status.text=if(shown) "${receipt.status} · เพิ่ม ${receipt.added} · revision ${receipt.revision} · receipt ${receipt.id.take(8)} · กำลังแสดงข้อมูลจากไฟล์"
                        else "บันทึกแล้ว · receipt ${receipt.id.take(8)} · แสดงผลไม่สำเร็จ กดลองแสดงใหม่"
                    // Keep queued commands paused until the reload confirms its frame.
                }.onFailure {busy=false;status.text="นำเข้าไม่ได้ · ข้อมูลเดิมยังอยู่ · ${it.message}";renderer.reloadStyle()}
            }
        }
    }
    private fun exportGeoJson(uri:android.net.Uri) {
        status.text="กำลังส่งออก GOVIEW…"
        worker.execute {
            val result=runCatching {
                val text=store.exportGeoJson()
                contentResolver.openOutputStream(uri,"wt").use {output->requireNotNull(output).write(text.toByteArray(Charsets.UTF_8))}
            }
            handler.post {if(!destroyed)status.text=if(result.isSuccess)"ส่งออก GOVIEW Map Update Package v1 แล้ว · ไฟล์มีพิกัดหมุด" else "ส่งออกไม่ได้ · ${result.exceptionOrNull()?.message}"}
        }
    }
    private fun showUpdateReceipts() {
        worker.execute {
            val journal=store.load()
            val text="revision ${journal.state.revision} · ${journal.state.pins.size} หมุด\n"+
                journal.updates.takeLast(30).reversed().joinToString("\n") {"${it.status} · package v${it.packageVersion} · rev ${it.revision} · +${it.added}/edit ${it.changed} · ${it.id.take(8)} ${it.error.orEmpty()}"}
            handler.post {if(!destroyed)AlertDialog.Builder(this).setTitle("GOVIEW · receipt/readback").setMessage(text).setPositiveButton("ปิด",null).show()}
        }
    }
    private fun editPinDialog(id:String) {
        worker.execute {
            val journal=store.load();val pin=journal.state.pins[id]?:return@execute
            handler.post {
                if(!destroyed) {
                    val form=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL}
                    val label=EditText(this).apply {hint="ชื่อหมุด";setText(pin.label)}
                    val longitude=EditText(this).apply {hint="longitude";setText(pin.point.longitude.toString())}
                    val latitude=EditText(this).apply {hint="latitude";setText(pin.point.latitude.toString())}
                    val field=CheckBox(this).apply {text="ฉันยืนยันพิกัดหน้างานด้วยตนเอง";isChecked=pin.evidence.source=="owner-field-confirmation"}
                    form.addView(label);form.addView(longitude);form.addView(latitude);form.addView(field)
                    AlertDialog.Builder(this).setTitle("GOVIEW · แก้ไขหมุด").setView(form).setNegativeButton("ยกเลิก",null)
                        .setPositiveButton("บันทึก"){_,_->
                            val point=runCatching {Point(longitude.text.toString().toDouble(),latitude.text.toString().toDouble())}.getOrNull()
                            if(point==null){status.text="พิกัดไม่ถูกต้อง";return@setPositiveButton}
                            if(busy || importing){status.text="รอแผนที่ทำงานเสร็จ แล้วลองใหม่";return@setPositiveButton}
                            val name=label.text.toString().trim();val confirmed=field.isChecked
                            importing=true;busy=true
                            worker.execute {
                                val saved=runCatching {store.editOwnerPin(id,name,point,confirmed,journal.state.revision)}
                                if(!destroyed)handler.post {
                                    if(!destroyed){importing=false;busy=false
                                        saved.onSuccess {val displaying=GeoJsonImport.present({},{renderer.reloadStyle()});status.text="บันทึกแล้ว · revision ${it.revision} · receipt ${it.id.take(8)}"+if(displaying)"" else " · แสดงผลไม่สำเร็จ กดลองแสดงใหม่"}
                                            .onFailure {status.text="บันทึกไม่ได้ · ${it.message}"}
                                    }
                                }
                            }
                        }.show()
                }
            }
        }
    }
    private fun noteDialog(id:String,label:String){val value=EditText(this).apply {setText(store.load().state.notes[id].orEmpty())};AlertDialog.Builder(this).setTitle("โน้ต · $label").setView(value).setNegativeButton("ยกเลิก",null).setPositiveButton("บันทึก"){_,_->enqueue(MapCommand("note:${UUID.randomUUID()}",MapAction.NOTE,MapTarget(id,"map"),note=value.text.toString().take(4000)))}.show()}
    fun context():JSONObject {
        val state=store.load().state
        val pins=JSONArray();state.pins.values.take(32).forEach {pins.put(JSONObject().put("id",it.id).put("label",it.label).put("longitude",it.point.longitude).put("latitude",it.point.latitude).put("source",it.evidence.source))}
        val center=renderer.center()
        return JSONObject().put("mapSummary",JSONObject().put("revision",state.revision).put("pins",pins).put("notes",JSONObject(state.notes as Map<*,*>)).put("center",center?.let {JSONObject().put("longitude",it.longitude).put("latitude",it.latitude)}?:JSONObject.NULL))
    }
    private fun updateSharingStatus(){
        if(destroyed||importing||!::mapShare.isInitialized||!::sharingStatus.isInitialized)return
        worker.execute {
            val journal=store.load()
            handler.post {
                if(!destroyed && !importing) {
                    val recent=mapShare.lastAck?.let {System.currentTimeMillis()-it in 0..14_999}==true
                    val fresh=recent&&renderer.foregroundReady&&journal.renderedRevision==journal.state.revision&&mapShare.acknowledgedRevision==journal.state.revision
                    val state=SharingStatus.resolve(mapShare.sharing,mapShare.isPaired(),foreground,ObservatoryTheme.online(this),fresh,mapShare.lastAck,mapShare.deliveryFailed,System.currentTimeMillis())
                    sharingStatus.text=state.label
                    sharingStatus.setTextColor(if(state==SharingState.LIVE)ObservatoryTheme.lime else ObservatoryTheme.muted)
                }
            }
        }
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
        return com.big.gobrowser.transport.EvidenceExport.redactText("YGG OBSERVATORY — MAP EVIDENCE (owner-shared)\n" + com.big.gobrowser.transport.EvidenceExport.redactJson(evidence).toString(2))
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


    private fun button(label:String,action:()->Unit)=ObservatoryTheme.button(this,label){if(importing)status.text="กำลังบันทึก GeoJSON…" else action()}
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==ForegroundLocationController.REQUEST_CODE)location.permissionResult()}
    private fun scroll(row:LinearLayout)=HorizontalScrollView(this).apply {isHorizontalScrollBarEnabled=false;addView(row,ViewGroup.LayoutParams(-2,-2))}
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);val uri=data?.data?:return;if(requestCode==42&&resultCode==RESULT_OK){importGeoJson(uri);return};if(requestCode==43&&resultCode==RESULT_OK){exportGeoJson(uri);return};if(requestCode==40&&resultCode==RESULT_OK){status.text="กำลังนำเข้าแผนที่…";worker.execute {val result=runCatching {packageStore.import(uri)};handler.post {if(!destroyed)result.onSuccess {renderer.reloadStyle();status.text="นำเข้า ${it.attribution}"}.onFailure {status.text="นำเข้าไม่ได้: ${it.message}"}}}}}
    override fun onStart(){super.onStart();renderer.onStart()}
    override fun onResume(){super.onResume();foreground=true;busy=true;renderer.onResume();location.resume();handler.post(statusTick);updateSharingStatus()}
    override fun onPause(){foreground=false;handler.removeCallbacks(statusTick);location.pause();mapShare.stop();renderer.onPause();updateSharingStatus();super.onPause()}
    override fun onStop(){renderer.onStop();super.onStop()}
    override fun onDestroy(){destroyed=true;handler.removeCallbacks(statusTick);location.pause();mapShare.close();worker.shutdown();renderer.onDestroy();super.onDestroy()}
    override fun onLowMemory(){super.onLowMemory();renderer.onLowMemory()}
    override fun onSaveInstanceState(outState:Bundle){super.onSaveInstanceState(outState);renderer.onSaveInstanceState(outState)}
}


