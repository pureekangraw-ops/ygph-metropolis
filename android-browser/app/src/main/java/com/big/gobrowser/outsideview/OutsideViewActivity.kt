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
import com.big.gobrowser.browser.RemoteBrowserActivity
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
    private lateinit var directStatus:TextView
    private val directClient by lazy { GoviewDirectClient(this) }
    private var directFetching=false
    private var directGeneration=0L
    private var directSettingsOpen=false
    private var directPromptOpen=false
    private val directTick=object:Runnable { override fun run(){
        if(foreground && !destroyed) {
            pollDirect()
            handler.postDelayed(this,12_000)
        }
    }}
    private lateinit var location:ForegroundLocationController
    private var foreground=false
    private val statusTick=object:Runnable {override fun run(){if(foreground){updateSharingStatus();updateLocationSession();handler.postDelayed(this,10_000)}}}
    private val handler=Handler(Looper.getMainLooper())
    private val worker=Executors.newSingleThreadExecutor()
    private val commands=java.util.ArrayDeque<MapCommand>()
    private lateinit var mapShare:ObservatoryMapShare
    private lateinit var shareButton:Button
    private var importing=false
    private var busy=false
    private var displayedRevision=-1L
    private var activeCommandId:String?=null
    private var locationSessionRequested=false
    @Volatile private var commandRendererReady=false
    @Volatile private var commandRendererGeneration=0L
    @Volatile private var destroyed=false
    @Volatile private var storageUnavailable=false
    private var pendingExportPath:String?=null
    private fun storageFailure() {
        storageUnavailable=true
        handler.post {if(!destroyed){busy=false;status.text="อ่านที่เก็บข้อมูลไม่ได้ · หยุดการบันทึกและแชร์ · ไฟล์เดิมยังอยู่ · แตะข้อความนี้เพื่อตรวจสำเนากู้คืน";if(::shareButton.isInitialized)shareButton.isEnabled=false}}
    }
    private fun readJournal():MapJournal?=try {store.load()}catch(error:Exception){storageFailure();null}

    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        store=MapStateStore(this);packageStore=LocalMapPackageStore(this)
        pendingExportPath=savedInstanceState?.getString("goview.selectedExport")
        val root=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;setPadding(12,8,12,8)}
        root.addView(ObservatoryTheme.title(this,"หอดูดาว · GOVIEW"))
        root.addView(ObservatoryBuildStamp.view(this))
        status=ObservatoryTheme.status(this).apply {text="กดค้างบนแผนที่เพื่อบันทึกจุด";setOnClickListener {if(storageUnavailable)showRecoveryTools()}}
        sharingStatus=ObservatoryTheme.status(this);root.addView(sharingStatus)
        gpsStatus=ObservatoryTheme.status(this).apply {text="ตำแหน่งฉัน · กดเพื่อใช้ GPS จากเครื่อง"}
        root.addView(status)
        val tools=LinearLayout(this)
        tools.addView(button("บันทึกจุด"){renderer.center()?.let(::pinDialog)})
        tools.addView(button("จุดของฉัน"){listPins()})
        tools.addView(button("ตำแหน่งฉัน"){requestMyLocation()})
        tools.addView(button("เพิ่มเติม"){showMapTools()})
        tools.addView(button("GO Direct"){showDirectSettings()})
        root.addView(scroll(tools))
        // New Map Studio is a standalone action: do not crowd the original phone toolbar.
        root.addView(button("✎ GO Map Studio · สร้างแผนที่"){startActivity(Intent(this,GoviewStudioActivity::class.java))})
        shareButton=button("GOVIEW · เลือก Snapshot / ไฟล์ให้ GO"){selectSnapshot()}
        root.addView(shareButton)
        root.addView(gpsStatus)
        directStatus=ObservatoryTheme.status(this).apply {text="GO Direct · ปิดอยู่ · แตะเพื่อเชื่อมต่อ";setOnClickListener {showDirectSettings()}}
        root.addView(directStatus)
        val host=FrameLayout(this);root.addView(host,LinearLayout.LayoutParams(-1,0,1f))
        root.addView(TextView(this).apply {text=packageStore.active()?.attribution?:"© OpenStreetMap contributors · openstreetmap.org/copyright";textSize=12f;setOnClickListener {startActivity(Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://www.openstreetmap.org/copyright")))}})
        ObservatoryTheme.apply(this,root)
        PhoneLayout.fitSystemBars(root)
        setContentView(root)
        renderer=MapLibreOutsideRenderer(host,packageStore,savedInstanceState)
        val commandRenderer=object:MapRenderer {
            override val foregroundReady:Boolean get()=commandRendererReady
            override val styleGeneration:Long get()=commandRendererGeneration
            override fun render(request:RenderRequest,callback:(RenderConfirmation)->Unit) {
                handler.post {if(!destroyed && foreground)renderer.render(request){confirmation->
                    if(!destroyed && !worker.isShutdown)worker.execute {
                        callback(confirmation) // Executor reports the actual durable receipt separately.
                    }
                }}
            }
            override fun cancel(){handler.post {if(!destroyed)renderer.cancel()}}
        }
        executor=MapCommandExecutor(store,commandRenderer,ExecutionScope.LOCAL_OWNER,onStorageError={storageFailure()},onReceipt={receipt->
            handler.post {if(!destroyed && !storageUnavailable && activeCommandId==receipt.commandId){
                if(receipt.status==MapReceiptStatus.PENDING){status.text="รอการยืนยันภาพที่ตรงกัน · ยังไม่ยืนยันสำเร็จ";renderer.reloadStyle()}
                else {busy=false;activeCommandId=null
                    if(receipt.status==MapReceiptStatus.APPLIED)displayedRevision=receipt.revision
                    status.text="${receipt.status} · revision ${receipt.revision} · ${receipt.reason.orEmpty()}";pump()
                }
            }}
        })
        mapShare=ObservatoryMapShare(this,store,{foreground&&renderer.foregroundReady&&readJournal()?.let {it.pending==null&&it.renderedRevision==it.state.revision}==true},{message->status.text=message;updateSharingStatus()},{renderer.cameraSnapshot()})
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
                                if(accepted){displayedRevision=confirmation.revision;pump()}
                                else if(confirmation.error==null)renderer.reloadStyle() // another Activity completed a newer transaction
                            }.onFailure {status.text="บันทึกข้อมูลแล้ว แต่ยืนยันภาพไม่ได้ · กดลองแสดงใหม่"}
                            updateSharingStatus()
                        }
                    }
                }
            }
            // Command confirmations persist on the serialized worker before updating the UI.
        }
        renderer.onReady=ready@{
            if(destroyed || importing)return@ready
            commandRendererReady=renderer.foregroundReady;commandRendererGeneration=renderer.styleGeneration
            busy=true
            val generation=renderer.styleGeneration
            worker.execute {
                val loaded=runCatching {store.prepareScreen()}
                handler.post {
                    if(!destroyed && foreground && generation==renderer.styleGeneration) loaded.onSuccess {journal->
                        storageUnavailable=false;shareButton.isEnabled=true
                        if(journal.pending!=null){activeCommandId=journal.pending.command.commandId;worker.execute {runCatching {executor.resume()}.onFailure {storageFailure()}}}
                        else renderer.render(RenderRequest("screen-${UUID.randomUUID()}",journal.state.revision,generation,"screen",journal.state)){}
                    }.onFailure {storageFailure()}
                }
            }
        }
    }
    private fun requestMyLocation() {
        locationSessionRequested=false
        if(GoviewLocationService.running){
            val fix=GoviewLocationService.currentFix();gpsStatus.text=GoviewLocationService.description
            if(fix!=null){val point=Point(fix.longitude,fix.latitude);renderer.showLocation(point);location.onCenter(point)}
        }else{location.resume();location.request()}
    }
    private fun updateLocationSession() {
        if(!foreground)return
        if(GoviewLocationService.running){gpsStatus.text=GoviewLocationService.description;renderer.showLocation(GoviewLocationService.currentFix()?.let {Point(it.longitude,it.latitude)})}
        else if(locationSessionRequested){locationSessionRequested=false;gpsStatus.text=GoviewLocationService.description;renderer.showLocation(null)}
    }
    private fun locationSessionDialog() {
        if(GoviewLocationService.running){
            AlertDialog.Builder(this).setTitle("หยุด GPS ต่อเนื่อง?").setMessage("หยุดรับตำแหน่งและล้างตำแหน่งล่าสุดในหน่วยความจำ")
                .setNegativeButton("ใช้ต่อ",null).setPositiveButton("หยุด GPS"){_,_->locationSessionRequested=false;stopService(Intent(this,GoviewLocationService::class.java));renderer.showLocation(null);gpsStatus.text="หยุด GPS ต่อเนื่องแล้ว"}.show()
            return
        }
        AlertDialog.Builder(this).setTitle("เริ่ม GPS ต่อเนื่อง?")
            .setMessage("รับตำแหน่งต่อเมื่อสลับแอปหรือปิดหน้าจอ มีการแจ้งเตือนพร้อมปุ่มหยุด ไม่บันทึกเส้นทางหรือส่ง GPS ออก ใช้แบตเตอรี่เพิ่ม ระบบหรือ Xiaomi อาจหยุดงานได้ · ยังไม่มีระบบนำทางเสียง")
            .setNegativeButton("ยกเลิก",null).setPositiveButton("เริ่ม GPS"){_,_->
                val granted=checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED || checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED
                val notifications=android.os.Build.VERSION.SDK_INT<33 || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED
                if(!granted){requestPermissions(arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION,android.Manifest.permission.ACCESS_COARSE_LOCATION),44);return@setPositiveButton}
                if(!notifications){requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),44);return@setPositiveButton}
                val manager=getSystemService(android.location.LocationManager::class.java)
                val enabled=if(android.os.Build.VERSION.SDK_INT>=28)manager.isLocationEnabled else manager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)||manager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
                if(!LocationSessionPolicy.mayStart(true,foreground,granted,notifications && getSystemService(android.app.NotificationManager::class.java).areNotificationsEnabled(),enabled)){gpsStatus.text="ยังไม่เริ่ม · เปิดตำแหน่งและการแจ้งเตือน แล้วกดเริ่มในหน้าแผนที่";return@setPositiveButton}
                runCatching {startForegroundService(Intent(this,GoviewLocationService::class.java).setAction(GoviewLocationService.START))}
                    .onSuccess {locationSessionRequested=true;location.pause();gpsStatus.text="กำลังเริ่ม GPS ต่อเนื่อง · ตรวจการแจ้งเตือน"}
                    .onFailure {gpsStatus.text="เริ่มไม่ได้ · เปิดหน้าแผนที่และตรวจสิทธิ์ก่อนลองใหม่"}
            }.show()
    }
    private fun showMapTools() {
        val labels=arrayOf("ไลร่า", "ส่งแผนที่ให้ GO", "ส่งภาพแผนที่", "กลับ Browser", "เก็บช่วงนี้", "ที่เก็บไว้", "นำเข้า PMTiles", "ลองแสดงใหม่", "โน้ต", "กลับ", "นำเข้า GeoJSON", "ค้นหาหมุด", "ชั้นข้อมูล", "ส่งออก GeoJSON · GOVIEW", "ผลอัปเดต GOVIEW", "สำรอง / กู้คืน GOVIEW", "หมวดหมู่หมุด", "GPS ต่อเนื่อง · เริ่ม / หยุด", "GO Direct · ตั้งค่าการเชื่อม", "อัปเดตแอป Observatory")
        AlertDialog.Builder(this).setTitle("GOVIEW · เครื่องมือแผนที่").setItems(labels){_,choice->
            when(choice){
                0->LyraDialog.show(this,"OUTSIDE"){context()}
                1->shareMapToGo()
                2->shareVisibleMapImage()
                3->startActivity(Intent(this,RemoteBrowserActivity::class.java))
                4->ObservatoryMemoryDialog.preserve(this,"map",currentMapHandoff())
                5->ObservatoryMemoryDialog.saved(this)
                6->startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),40)
                7->renderer.reloadStyle()
                8->noteDialog("outside","พื้นที่นี้")
                9->finish()
                10->startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),42)
                11->searchPins()
                12->showLayers()
                13->selectSnapshot()
                14->showUpdateReceipts()
                15->showStorageTools()
                16->showCategories()
                17->locationSessionDialog()
                18->showDirectSettings()
                19->startActivity(Intent(this,com.big.gobrowser.update.AppMaintenanceActivity::class.java))
            }
        }.setNegativeButton("ปิด",null).show()
    }
    /** The GO bridge is set once in Settings. GPS and saved maps are never uploaded. */
    private fun showDirectSettings() {
        if(directSettingsOpen)return
        directSettingsOpen=true
        directGeneration++
        directClient.cancelPending()
        val connected=directClient.configured()
        val input=EditText(this).apply {
            hint="Android read token จากเจ้าของ Cloudflare"
            inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine()
        }
        AlertDialog.Builder(this).setTitle("GOVIEW · GO Direct")
            .setMessage(if(connected)
                "มีข้อมูลการเชื่อมที่บันทึกไว้ · ต้องตรวจการเชื่อมก่อนยืนยัน · แยกจากสิทธิ์ GO อ่านใน Browser"
                else "ตั้งค่าคีย์อ่านของอุปกรณ์ครั้งเดียว · เก็บด้วย Android Keystore ไม่แสดงในหน้าแผนที่")
            .setView(input).setNegativeButton("ปิด",null)
            .setNeutralButton("ยกเลิกการเชื่อม"){_,_->
                runCatching {directClient.disconnect()}
                    .onSuccess {directStatus.text="GO Direct · ปิดแล้ว"}
                    .onFailure {directStatus.text="GO Direct · ยกเลิกไม่สำเร็จ · "+directSafeError(it)}
            }
            .setPositiveButton("เชื่อม / อัปเดตคีย์"){_,_->
                val candidate=input.text.toString().trim()
                input.text.clear()
                val generation=++directGeneration
                val ticket=directClient.beginValidation()
                directStatus.text="GO Direct · กำลังตรวจการเชื่อม · ยังไม่รับคำสั่ง"
                worker.execute {
                    val result=runCatching {directClient.validate(ticket,candidate)}
                    handler.post {
                        if(!destroyed && foreground && generation==directGeneration) {
                            result.onSuccess { accepted ->
                                if(accepted) directStatus.text="GO Direct · ยืนยันการเชื่อมแล้ว · รอรอบรับคำสั่ง"
                            }.onFailure {
                                directStatus.text=if(it is DirectActivationIncomplete)
                                    "GO Direct · การบันทึก/เปิดรับคำสั่งยังไม่ครบ · เชื่อมใหม่ · "+directSafeError(it)
                                else "GO Direct · ตรวจการเชื่อมไม่ผ่าน · "+directSafeError(it)
                            }
                        }
                    }
                }
            }.create().also { dialog ->
                dialog.setOnDismissListener { directSettingsOpen=false; input.text.clear() }
                dialog.show()
            }
    }

    /** No network request is executed on Android's UI thread. */
    private fun pollDirect() {
        if(foreground && !destroyed && directClient.requiresReconnect()) {
            directStatus.text="GO Direct · ต้องตรวจการเชื่อมใหม่ · แผนที่ยังใช้งานด้วยมือได้"
            return
        }
        if(!foreground || destroyed || storageUnavailable || directFetching || directPromptOpen || directSettingsOpen ||
            !directClient.canPoll())return
        val generation=directGeneration
        directFetching=true
        worker.execute {
            val received=runCatching {directClient.pending()}
            handler.post {
                directFetching=false
                if(!destroyed && foreground && generation==directGeneration) {
                    received.onSuccess {commands->
                        directStatus.text=if(commands.isEmpty())"GO Direct · เชื่อมอยู่ · รอคำสั่ง"
                            else "GO Direct · มีคำสั่งจาก GO"
                        if(commands.isNotEmpty() && !directPromptOpen){
                            directPromptOpen=true
                            openDirectProposal(commands.first())
                        }
                    }.onFailure {directStatus.text="GO Direct · ตรวจคำสั่งไม่ได้ · "+directSafeError(it)}
                }
            }
        }
    }

    private fun reportDirect(command:GoviewDirectProposal, result:String, revision:Long,verified:Boolean) {
        worker.execute {
            val sent=runCatching {directClient.receipt(command,result,revision,verified)}
            handler.post {
                if(!destroyed) {
                    directPromptOpen=false
                    if(sent.isFailure)directStatus.text="GO Direct · ยังส่ง Receipt ไม่ได้ · จะพบคำสั่งเดิมอีกครั้ง"
                    else directStatus.text="GO Direct · "+result+" · revision "+revision
                }
            }
        }
    }

    private fun openDirectProposal(proposal:GoviewDirectProposal) {
        if(!foreground||destroyed){directPromptOpen=false;return}
        withJournal {journal->
            if(!foreground){directPromptOpen=false;return@withJournal}
            if(proposal.expectedRevision!=null && proposal.expectedRevision!=journal.state.revision) {
                reportDirect(proposal,"FAILED",journal.state.revision,false)
                return@withJournal
            }
            if(proposal.type=="POINT_FOCUS") {
                val rendered=renderer.centerOnLocation(proposal.point)
                reportDirect(proposal,if(rendered)"DISPLAY_REQUESTED" else "FAILED",journal.state.revision,false)
                return@withJournal
            }
            val pinId="go-direct-"+proposal.commandId.replace("-","")
            val known=journal.state.pins[pinId]
            if(known!=null){
                val same=known.point==proposal.point && known.label==proposal.label
                reportDirect(proposal,if(same)"APPLIED" else "FAILED",journal.state.revision,same)
                return@withJournal
            }
            AlertDialog.Builder(this)
                .setTitle("GO เสนอหมุดใหม่")
                .setMessage((proposal.label?:"ไม่ระบุชื่อ")+"\n"+
                    proposal.point.latitude+", "+proposal.point.longitude+
                    "\n\nพิกัดจาก GO ยังไม่ใช่การยืนยันหน้างาน บันทึกเป็นข้อมูลรอตรวจเท่านั้น")
                .setNegativeButton("ไม่รับ"){_,_->
                    reportDirect(proposal,"DECLINED",journal.state.revision,false)
                }
                .setOnCancelListener {
                    reportDirect(proposal,"DECLINED",journal.state.revision,false)
                }
                .setPositiveButton("เพิ่มหมุด"){_,_->
                    worker.execute {
                        val saved=runCatching {
                            val pin=Pin(pinId,requireNotNull(proposal.label),proposal.point,"",
                                Evidence(EvidenceStatus.UNKNOWN,"go-direct-proposal"))
                            val batch=GeoJsonBatch(listOf(pin),packageId="go-direct-"+proposal.commandId,
                                packageVersion=1,baseVersion=proposal.expectedRevision)
                            val preview=store.previewUpdate(batch,proposal.commandId)
                            store.approveUpdate(preview)
                        }
                        handler.post {
                            if(!destroyed) {
                                saved.onSuccess {receipt->
                                    if(receipt.readbackVerified && receipt.status in setOf("SAVED","DUPLICATE")) {
                                        renderer.reloadStyle()
                                        reportDirect(proposal,"APPLIED",receipt.revision,true)
                                    } else {
                                        // Persisted outcome may be uncertain. Never resend the edit blindly.
                                        directPromptOpen=false
                                        directStatus.text="GO Direct · บันทึกอาจสำเร็จ · เปิดผลอัปเดตเพื่อตรวจอ่านกลับ"
                                    }
                                }.onFailure {
                                    reportDirect(proposal,"FAILED",readJournal()?.state?.revision?:journal.state.revision,false)
                                }
                            }
                        }
                    }
                }.show()
        }
    }

    private fun enqueue(vararg commands:MapCommand){commands.forEach {this.commands.addLast(it)};pump()}
    private fun pump(){
        if(storageUnavailable||importing||busy||commands.isEmpty()||!renderer.foregroundReady)return
        busy=true
        val command=commands.removeFirst();activeCommandId=command.commandId
        worker.execute {
            val result=runCatching {executor.submit(command)}
            handler.post {if(!destroyed)result.onSuccess {receipt->
                if(receipt.status!=MapReceiptStatus.PENDING){busy=false;status.text="${receipt.status}: ${receipt.reason.orEmpty()}";pump()}
            }.onFailure {storageFailure()}}
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
    private fun withJournal(action:(MapJournal)->Unit) {
        worker.execute {val journal=readJournal()?:return@execute;handler.post {if(!destroyed)action(journal)}}
    }
    private fun listPins(query:String="",category:String?=null){withJournal {journal->val pins=journal.state.pins.values.filter {(it.label.contains(query,true)||it.note.orEmpty().contains(query,true))&&(category==null||it.category==category)};if(pins.isEmpty()){status.text="ยังไม่มีจุดที่บันทึก";return@withJournal};AlertDialog.Builder(this).setTitle("จุดของฉัน").setItems(pins.map {it.label}.toTypedArray()){_,i->val pin=pins[i];AlertDialog.Builder(this).setTitle(pin.label).setItems(arrayOf("ดูบนแผนที่","เปิดนำทาง","เพิ่มโน้ต","ลบจุด","ข้อมูลจากไฟล์","แก้ไข / ยืนยันหน้างาน")){_,a->when(a){0->enqueue(MapCommand("focus:${UUID.randomUUID()}",MapAction.FOCUS,MapTarget(pin.id,"pin")));1->status.text=if(PinNavigation.launch(this,pin)==NavigationResult.HANDOFF_STARTED)"เปิดแอปนำทางแล้ว" else "ไม่มีแอปนำทางที่รองรับ";2->noteDialog(pin.id,pin.label);3->enqueue(MapCommand("remove:${UUID.randomUUID()}",MapAction.REMOVE,MapTarget(pin.id,"pin")));4->AlertDialog.Builder(this).setTitle("ข้อมูลต้นทาง · ${pin.evidence.coordinate}").setMessage(pin.note?:pin.evidence.source.orEmpty()).setPositiveButton("ปิด",null).show();5->editPinDialog(pin.id)}}.show()}.show()}}
    private fun showCategories() {withJournal {journal->
        val categories=journal.state.pins.values.map {it.category}.distinct().sorted()
        AlertDialog.Builder(this).setTitle("หมวดหมู่").setItems(categories.map {it.ifBlank {"ยังไม่จัดหมวด"}}.toTypedArray()){_,i->listPins(category=categories[i])}.show()
    }}
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
        if(storageUnavailable || busy || importing || commands.isNotEmpty()){status.text="รอแผนที่พร้อม แล้วนำเข้าใหม่";return}
        importing=true;busy=true
        val correlation=UUID.randomUUID().toString()
        status.text="GOVIEW · กำลังอ่านไฟล์ · ยังไม่อัปเดตหมุด"
        worker.execute {
            var phase="DOWNLOAD"
            val prepared=runCatching {
                val batch=contentResolver.openInputStream(uri).use {GoviewSandboxContract.readFile(requireNotNull(it))}
                store.receiveFile(batch,correlation)
                phase="UPDATE"
                store.previewUpdate(batch,correlation)
            }
            if(prepared.isFailure)runCatching {store.recordPhaseFailure(phase,correlation,prepared.exceptionOrNull()?.message?:"Validation failed")}
            handler.post {
                if(destroyed)return@post
                prepared.onSuccess {preview->
                    val recenter=CheckBox(this).apply {text="เลื่อนไปหมุดที่นำเข้า · แผนที่ออนไลน์อาจขอภาพถนนบริเวณนั้นจากผู้ให้บริการ";isChecked=false}
                    val previewForm=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;setPadding(16,8,16,8)}
                    val details=TextView(this).apply {text="อ่านไฟล์แล้ว แต่ยังไม่บันทึกหมุด\nเพิ่ม ${preview.added} · ซ้ำ ${preview.duplicates} · ไม่แทนข้อมูลที่ขัดแย้ง\npackage v${preview.packageVersion} · base ${preview.expectedRevision} · capture ${preview.batch.sourceCaptureId?:"local-file"}\ncorrelation ${preview.correlationId}\nข้อมูลไฟล์ยังไม่ใช่การยืนยันหน้างาน\n${preview.batch.pins.joinToString("\n") {"${it.id} · ${it.label} · ${it.point.longitude}, ${it.point.latitude}"}}\nอนุมัติเพื่อบันทึกและตรวจอ่านกลับ";setTextIsSelectable(true)}
                    val detailScroll=ScrollView(this).apply {addView(details)}
                    previewForm.addView(detailScroll,LinearLayout.LayoutParams(-1,resources.displayMetrics.heightPixels/3))
                    previewForm.addView(recenter)
                    AlertDialog.Builder(this).setTitle("GOVIEW · ตรวจแล้วรออนุมัติ").setView(previewForm)
                        .setNegativeButton("ยกเลิก"){_,_->importing=false;busy=false;pump()}
                        .setOnCancelListener {importing=false;busy=false;pump()}
                        .setPositiveButton("อนุมัติ Update"){_,_->approveUpdate(preview,recenter.isChecked)}.show()
                }.onFailure {importing=false;busy=false;status.text="ไม่อัปเดต · ${it.message}";worker.execute {readJournal()}}
            }
        }
    }
    private fun approveUpdate(preview:MapUpdatePreview,recenter:Boolean) {
        worker.execute {
            val saved=runCatching {store.approveUpdate(preview)}
            if(saved.isFailure)runCatching {store.recordPhaseFailure("UPDATE",preview.correlationId,saved.exceptionOrNull()?.message?:"Update failed")}
            handler.post {
                if(destroyed)return@post
                importing=false;busy=false
                saved.onSuccess {receipt->
                    val shown=GeoJsonImport.present({if(recenter)renderer.fitPoints(preview.batch.pins.map {it.point})},{renderer.reloadStyle()})
                    status.text="UPDATE ${receipt.status} · readback ${receipt.readbackVerified} · receipt ${receipt.id}"+if(shown)" · กำลังแสดง" else " · แสดงผลไม่สำเร็จ กดลองแสดงใหม่"
                }.onFailure {status.text="Update ไม่สำเร็จ · ${it.message}";worker.execute {readJournal()}}
            }
        }
    }
    private fun selectSnapshot() {
        worker.execute {
            val journal=readJournal()?:return@execute
            val pins=journal.state.pins.values.toList()
            handler.post {
                if(destroyed)return@post
                val checked=BooleanArray(pins.size)
                AlertDialog.Builder(this).setTitle("เลือกหมุด · ชื่อและพิกัดเท่านั้น")
                    .setMultiChoiceItems(pins.map {it.label}.toTypedArray(),checked){_,i,value->checked[i]=value}
                    .setNegativeButton("ยกเลิก",null).setPositiveButton("ดูรายการก่อนสร้าง"){_,_->
                        val selected=pins.filterIndexed {i,_->checked[i]}
                        if(selected.isEmpty()){status.text="ยังไม่ได้เลือกหมุด";return@setPositiveButton}
                        AlertDialog.Builder(this).setTitle("Snapshot ${selected.size} หมุด · v${journal.state.revision}")
                            .setMessage(selected.joinToString("\n") {"${it.label} · ${it.point.longitude}, ${it.point.latitude}"}+"\nไฟล์มีเฉพาะ ID ชื่อ พิกัดที่เลือก ไม่รวม GPS ประวัติ โน้ต หรือ viewport · ยังไม่ส่งไปบริการใด")
                            .setNegativeButton("ยกเลิก",null).setPositiveButton("สร้าง Snapshot และเลือกไฟล์"){_,_->
                                worker.execute {
                                    val result=runCatching {
                                        val snapshot=store.selectedSnapshot(selected.map {it.id}.toSet(),journal.state.revision)
                                        val file=java.io.File(cacheDir,"goview-selected-${snapshot.captureId}.geojson")
                                        java.io.FileOutputStream(file).use {it.write(snapshot.json.toByteArray(Charsets.UTF_8));it.fd.sync()}
                                        snapshot to file.absolutePath
                                    }
                                    handler.post {if(!destroyed)result.onSuccess {(snapshot,path)->
                                        pendingExportPath=path;status.text="SNAPSHOT CAPTURED_LOCAL · ${snapshot.captureId} · receipt ${snapshot.receipt.id} · Upload ยังไม่เกิดขึ้น"
                                        startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/geo+json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"goview-selected.geojson"),43)
                                    }.onFailure {status.text="Snapshot ไม่สำเร็จ · ${it.message}"}}
                                }
                            }.show()
                    }.show()
            }
        }
    }
    private fun showRecoveryTools() {
        worker.execute {
            val names=store.backups()
            handler.post {if(!destroyed)AlertDialog.Builder(this).setTitle("กู้คืนที่เก็บเสียหาย · สำเนาที่มี").setItems(names.toTypedArray()){_,i->
                worker.execute {
                    val checked=runCatching {store.previewRecovery(names[i])}
                    handler.post {if(!destroyed)checked.onSuccess {preview->
                        AlertDialog.Builder(this).setTitle("อนุมัติกู้คืนจากสำเนาที่ตรวจแล้ว?")
                            .setMessage("${preview.name} · ${preview.pins} หมุด\nเก็บไฟล์หลักเดิมทั้งหมดก่อนกู้คืน ไม่ลบสำเนาเดิม ไม่มีการส่งข้อมูลออก")
                            .setNegativeButton("ยกเลิก",null).setPositiveButton("อนุมัติกู้คืน"){_,_->worker.execute {
                                val result=runCatching {store.approveRecovery(preview)}
                                handler.post {if(!destroyed)result.onSuccess {receipt->
                                    status.text="STORAGE ${receipt.status} · readback ${receipt.readbackVerified} · ${receipt.id}"
                                    if(receipt.readbackVerified){storageUnavailable=false;shareButton.isEnabled=true;renderer.reloadStyle()}
                                }.onFailure {status.text="กู้คืนไม่ได้ · เก็บต้นฉบับเดิมไว้ · ${it.message}"}}
                            }}.show()
                    }.onFailure {status.text="สำเนาไม่ผ่านตรวจ · ไม่เปลี่ยนต้นฉบับ · ${it.message}"}}
                }
            }.setNegativeButton("ปิด",null).show()}
        }
    }
    private fun showStorageTools() {
        AlertDialog.Builder(this).setTitle("GOVIEW · ที่เก็บบนเครื่อง").setItems(arrayOf("สร้างสำเนาสำรอง", "ตรวจและกู้คืนสำเนา")){_,choice->
            worker.execute {
                if(choice==0) {
                    val result=runCatching {store.createBackup()}
                    handler.post {if(!destroyed)status.text=result.fold({"สำรองแล้ว · $it"},{"สำรองไม่ได้ · ${it.message}"})}
                } else {
                    val names=store.backups()
                    handler.post {if(!destroyed)AlertDialog.Builder(this).setTitle("เลือกสำเนา").setItems(names.toTypedArray()){_,i->
                        worker.execute {
                            val result=runCatching {store.previewRestore(names[i])}
                            handler.post {if(!destroyed)result.onSuccess {preview->
                                AlertDialog.Builder(this).setTitle("อนุมัติกู้คืนทั้งแผนที่?")
                                    .setMessage("${preview.name} · ${preview.pins} หมุด\nแทนสถานะแผนที่ปัจจุบันด้วยสำเนานี้ และเก็บสำเนาปัจจุบันเพื่อย้อนกลับก่อนบันทึก")
                                    .setNegativeButton("ยกเลิก",null).setPositiveButton("อนุมัติกู้คืน"){_,_->worker.execute {
                                        val restored=runCatching {store.approveRestore(preview)}
                                        handler.post {if(!destroyed)restored.onSuccess {status.text="STORAGE ${it.status} · readback ${it.readbackVerified} · ${it.id}";renderer.reloadStyle()}.onFailure {status.text="กู้คืนไม่ได้ · ${it.message}"}}
                                    }}.show()
                            }.onFailure {status.text="สำเนาไม่ผ่านตรวจ · ${it.message}"}}
                        }
                    }.show()}
                }
            }
        }.show()
    }
    private fun exportGeoJson(uri:android.net.Uri) {
        status.text="กำลังส่งออก GOVIEW…"
        worker.execute {
            val result=runCatching {
                val path=requireNotNull(pendingExportPath){"Select snapshot again"}
                val file=java.io.File(path)
                require(file.canonicalFile.parentFile==cacheDir.canonicalFile && file.name.startsWith("goview-selected-"))
                val text=file.readText()
                GeoJsonImport.parse(text.byteInputStream())
                contentResolver.openOutputStream(uri,"wt").use {output->requireNotNull(output).write(text.toByteArray(Charsets.UTF_8))}
            }
            handler.post {if(!destroyed)status.text=if(result.isSuccess)"เขียนไฟล์ Snapshot ที่เลือกแล้ว · ไม่ใช่ Upload หรือ Update สำเร็จ" else "ส่งออกไม่ได้ · ${result.exceptionOrNull()?.message}"}
        }
    }
    private fun showUpdateReceipts() {
        worker.execute {
            val journal=readJournal()?:return@execute
            val text="revision ${journal.state.revision} · ${journal.state.pins.size} หมุด\n"+
                journal.updates.takeLast(30).reversed().joinToString("\n") {"${it.operation}/${it.status} · ${it.correlationId.take(8)} · readback ${it.readbackVerified} · package v${it.packageVersion} · rev ${it.revision} · +${it.added}/edit ${it.changed} · ${it.id.take(8)} ${it.error.orEmpty()}"}
            handler.post {if(!destroyed)AlertDialog.Builder(this).setTitle("GOVIEW · receipt/readback").setMessage(text).setPositiveButton("ปิด",null).show()}
        }
    }
    private fun editPinDialog(id:String) {
        worker.execute {
            val journal=readJournal()?:return@execute;val pin=journal.state.pins[id]?:return@execute
            handler.post {
                if(!destroyed) {
                    val form=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL}
                    val label=EditText(this).apply {hint="ชื่อหมุด";setText(pin.label)}
                    val longitude=EditText(this).apply {hint="longitude";setText(pin.point.longitude.toString())}
                    val latitude=EditText(this).apply {hint="latitude";setText(pin.point.latitude.toString())}
                    val category=EditText(this).apply {hint="หมวดหมู่";setText(pin.category)}
                    val field=CheckBox(this).apply {text="ฉันยืนยันพิกัดหน้างานด้วยตนเอง";isChecked=false}
                    val changed=object:android.text.TextWatcher {
                        override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int) {}
                        override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){field.isChecked=false}
                        override fun afterTextChanged(s:android.text.Editable?) {}
                    }
                    longitude.addTextChangedListener(changed);latitude.addTextChangedListener(changed)
                    form.addView(label);form.addView(longitude);form.addView(latitude);form.addView(category);form.addView(field)
                    AlertDialog.Builder(this).setTitle("GOVIEW · แก้ไขหมุด").setView(form).setNegativeButton("ยกเลิก",null)
                        .setPositiveButton("บันทึก"){_,_->
                            val point=runCatching {Point(longitude.text.toString().toDouble(),latitude.text.toString().toDouble())}.getOrNull()
                            if(point==null){status.text="พิกัดไม่ถูกต้อง";return@setPositiveButton}
                            if(busy || importing){status.text="รอแผนที่ทำงานเสร็จ แล้วลองใหม่";return@setPositiveButton}
                            val name=label.text.toString().trim();val confirmed=field.isChecked;val group=category.text.toString().trim()
                            importing=true;busy=true
                            worker.execute {
                                val saved=runCatching {store.editOwnerPin(id,name,point,confirmed,journal.state.revision,group)}
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
    private fun noteDialog(id:String,label:String){withJournal {journal->val value=EditText(this).apply {setText(journal.state.notes[id].orEmpty())};AlertDialog.Builder(this).setTitle("โน้ต · $label").setView(value).setNegativeButton("ยกเลิก",null).setPositiveButton("บันทึก"){_,_->enqueue(MapCommand("note:${UUID.randomUUID()}",MapAction.NOTE,MapTarget(id,"map"),note=value.text.toString().take(4000)))}.show()}}
    fun context():JSONObject = JSONObject().put("status","EXPLICIT_SNAPSHOT_SELECTION_REQUIRED").put("view","map")
    private fun updateSharingStatus(){
        if(destroyed||importing||!::mapShare.isInitialized||!::sharingStatus.isInitialized)return
        worker.execute {
            val journal=readJournal()?:return@execute
            handler.post {
                if(!destroyed && !importing) {
                    if(foreground && !busy && journal.pending==null && journal.state.revision!=displayedRevision)renderer.reloadStyle()
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

    private fun currentMapHandoff(): String = "GOVIEW · Select an explicit snapshot to export map data; no pins, GPS or viewport included."

    private fun shareMapToGo() {selectSnapshot()}



    private fun button(label:String,action:()->Unit)=ObservatoryTheme.button(this,label){if(storageUnavailable){status.text="ที่เก็บข้อมูลอ่านไม่ได้ · ปิดแล้วเปิดหน้าจอเพื่อลองอ่านใหม่"}else if(importing)status.text="กำลังบันทึก GeoJSON…" else action()}
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==ForegroundLocationController.REQUEST_CODE)location.permissionResult();if(requestCode==44)gpsStatus.text="ตรวจสิทธิ์แล้ว · หากอนุญาต ให้กดเริ่ม GPS ต่อเนื่องอีกครั้ง"}
    private fun scroll(row:LinearLayout)=HorizontalScrollView(this).apply {isHorizontalScrollBarEnabled=false;addView(row,ViewGroup.LayoutParams(-2,-2))}
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);val uri=data?.data?:return;if(requestCode==42&&resultCode==RESULT_OK){importGeoJson(uri);return};if(requestCode==43&&resultCode==RESULT_OK){exportGeoJson(uri);return};if(requestCode==40&&resultCode==RESULT_OK){status.text="กำลังนำเข้าแผนที่…";worker.execute {val result=runCatching {packageStore.import(uri)};handler.post {if(!destroyed)result.onSuccess {renderer.reloadStyle();status.text="นำเข้า ${it.attribution}"}.onFailure {status.text="นำเข้าไม่ได้: ${it.message}"}}}}}
    override fun onStart(){super.onStart();renderer.onStart()}
    override fun onResume(){super.onResume();foreground=true;busy=true;renderer.onResume();location.resume();handler.post(statusTick);handler.post(directTick);updateSharingStatus()}
    override fun onPause(){foreground=false;directGeneration++;directClient.cancelPending();commandRendererReady=false;handler.removeCallbacks(statusTick);handler.removeCallbacks(directTick);location.pause();mapShare.stop();renderer.onPause();updateSharingStatus();super.onPause()}
    override fun onStop(){renderer.onStop();super.onStop()}
    override fun onDestroy(){destroyed=true;directGeneration++;directClient.cancelPending();handler.removeCallbacks(statusTick);location.pause();mapShare.close();worker.shutdown();renderer.onDestroy();super.onDestroy()}
    override fun onLowMemory(){super.onLowMemory();renderer.onLowMemory()}
    override fun onSaveInstanceState(outState:Bundle){super.onSaveInstanceState(outState);renderer.onSaveInstanceState(outState);outState.putString("goview.selectedExport",pendingExportPath)}
}


