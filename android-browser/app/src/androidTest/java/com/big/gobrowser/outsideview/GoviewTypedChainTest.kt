package com.big.gobrowser.outsideview

import android.os.Process
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.Socket
import java.net.InetSocketAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Synthetic emulator-only loopback transport, real Android codecs/journal/Studio approval.
 * The test socket does not alter production HTTPS/credentials/network policy. No GPS or real maps.
 */
@RunWith(AndroidJUnit4::class)
class GoviewTypedChainTest {
    @get:Rule val screen=ActivityTestRule(GoviewStudioActivity::class.java,true,false)
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val args get()=InstrumentationRegistry.getArguments()
    private val context get()=instrumentation.targetContext
    private val root get()=File(context.filesDir,"goview-typed-synthetic-chain")
    private val checkpoint get()=File(root,"checkpoint.json")
    private val map get()=MapStateStore(File(root,"map"))
    private fun call(path:String,token:String="",method:String="GET",body:String?=null):String {
        require(path.startsWith("/v1/transfers/")||path.startsWith("/synthetic-go/")||path=="/synthetic-fixture/health")
        val port=requireNotNull(args.getString("goviewTypedPort")).toInt().also {require(it in 1024..65535)}
        val bytes=body?.toByteArray(Charsets.UTF_8)?:byteArrayOf()
        Socket().use {socket->
            socket.connect(InetSocketAddress("127.0.0.1",port),5000);socket.soTimeout=15000
            val header="$method $path HTTP/1.0\r\nHost: synthetic.invalid\r\nConnection: close\r\nAuthorization: Bearer $token\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\n\r\n"
            socket.getOutputStream().apply {write(header.toByteArray(Charsets.US_ASCII));write(bytes);flush()}
            val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
            while(true){val n=socket.getInputStream().read(buffer);if(n<0)break;check(out.size()+n<=GoviewTransfer.MAX_ENVELOPE+32768);out.write(buffer,0,n)}
            val raw=out.toString("UTF-8");val split=raw.indexOf("\r\n\r\n");check(split>0)
            val code=raw.substringBefore("\r\n").split(" ")[1].toInt()
            check(code in 200..299){"Synthetic fixture HTTP $code"}
            return raw.substring(split+4)
        }
    }
    private val transport get()=object:GoviewTransferTransport {
        override fun put(envelope:GoviewTransfer)=call("/v1/transfers/${envelope.transferId}","U".repeat(32),"PUT",envelope.json())
        override fun get(transferId:String,uploadReadback:Boolean)=call("/v1/transfers/$transferId",(if(uploadReadback)"U" else "R").repeat(32))
        override fun receipt(transferId:String,body:String)=call("/v1/transfers/$transferId/receipt","R".repeat(32),"POST",body)
    }
    private fun exchange()=GoviewSelectedTransfer(File(root,"transfers"),map,transport)
    private fun go(name:String,input:JSONObject)=JSONObject(call("/synthetic-go/$name","G".repeat(32),"POST",input.toString()))
    private fun feature(id:String,longitude:Int)=GeoJsonImport.parse("""{"type":"FeatureCollection","features":[{"type":"Feature","id":"$id","geometry":{"type":"Point","coordinates":[$longitude,20]},"properties":{"name":"Synthetic $id"}}]}""".byteInputStream())
    private fun proposal(s:GoviewTransfer):GoviewTransfer {
        val pkg=JSONObject("""{"type":"FeatureCollection","features":[{"type":"Feature","id":"go-added","geometry":{"type":"Point","coordinates":[11,21]},"properties":{"name":"Synthetic GO addition"}}]}""")
        val payload=JSONObject().put("contractVersion",1).put("operation","propose-update").put("sourceCaptureId",s.transferId).put("baseVersion",s.identity.getLong("baseVersion")).put("package",pkg).toString()
        return GoviewTransfer.parse(GoviewTransfer(s.transferId+"-proposal","PROPOSAL","goview.map-update",JSONObject().put("captureId",s.transferId).put("baseVersion",s.identity.getLong("baseVersion")).put("snapshotSha256",s.sha256),GoviewTransfer.digest(payload),payload).json())
    }
    private fun await(message:String,predicate:()->Boolean){val until=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);while(System.nanoTime()<until){if(predicate())return;Thread.sleep(100)};assertTrue(message,predicate())}
    private fun js(expression:String):Any? {
        val latch=CountDownLatch(1);val value=AtomicReference<String>()
        instrumentation.runOnMainSync {
            val web=GoviewStudioActivity::class.java.getDeclaredField("web").apply {isAccessible=true}.get(screen.activity) as WebView
            web.evaluateJavascript(expression){value.set(it);latch.countDown()}
        }
        assertTrue("Studio JS callback",latch.await(12,TimeUnit.SECONDS));return JSONTokener(value.get()?:"null").nextValue()
    }
    private fun studioExchange():GoviewStudioTransfer {
        val lock=GoviewStudioActivity::class.java.getDeclaredField("storageLock").apply {isAccessible=true}.get(null)
        return GoviewStudioTransfer(File(context.filesDir,"goview-typed-studio"),File(context.filesDir,"goview-transfers"),transport,
            {id->android.util.AtomicFile(File(context.filesDir,"goview-studio-maps/$id.goview.json")).openRead().use {it.readBytes()}},lock,
            {file->android.util.AtomicFile(file).openRead().use {it.readBytes()}})
    }
    @Test fun selectedAndStudioGoApplyReceiptsSurviveProcessRestart() {
        val phase=args.getString("goviewTypedPhase")
        assumeTrue("Only explicit emulator host driver runs synthetic transport",phase=="before"||phase=="after")
        assertTrue(JSONObject(call("/synthetic-fixture/health")).getBoolean("actualGo"))
        if(phase=="before")before() else after()
        val marker="GOVIEW_TYPED_CHAIN_${phase!!.uppercase()}_PASS actualGO/Worker/Android; synthetic transport; pid=${Process.myPid()}\n"
        instrumentation.sendStatus(0,android.os.Bundle().apply {putString("stream",marker)})
    }
    private fun before() {
        assertFalse("Do not overwrite previous synthetic evidence",checkpoint.exists());root.mkdirs()
        val store=map;store.importGeoJson(feature("selected",10));store.importGeoJson(feature("unrelated",12))
        val initial=store.load();val selected=initial.state.pins.keys.first()
        store.commit(initial.copy(state=initial.state.copy(notes=mapOf(selected to "PRIVATE synthetic owner note"))))
        val before=store.load().state;val snapshot=store.selectedSnapshot(setOf(selected),before.revision)
        val x=exchange();val invalid=JSONObject(snapshot.json).put("gps","PRIVATE synthetic fix").toString()
        assertTrue(runCatching {x.upload(snapshot.copy(json=invalid))}.isFailure)
        val s=x.upload(snapshot);assertFalse(s.payload.contains("PRIVATE"));assertEquals(1,GeoJsonImport.parse(s.payload.byteInputStream()).pins.size)
        val read=go("goview_transfer_read",JSONObject().put("transferId",s.transferId).put("sha256",s.sha256))
        assertTrue(read.toString(),read.getBoolean("ok"));assertEquals(s.payload,read.getJSONObject("envelope").getString("payload"))
        val p=proposal(s);assertTrue(go("goview_transfer_publish",JSONObject().put("envelope",JSONObject(p.json()))).getBoolean("ok"))
        assertFalse(go("goview_transfer_receipt",JSONObject().put("transferId",p.transferId)).getBoolean("ok"))
        val preview=x.download(s.transferId);assertEquals(before,store.load().state);assertEquals(before,map.load().state)
        val receipt=store.approveUpdate(preview);assertTrue(receipt.readbackVerified);x.report(receipt)
        val saved=store.load();assertEquals(3,saved.state.pins.size);assertEquals(before.notes,saved.state.notes)
        x.report(receipt);assertEquals(saved,store.load()) // identical receipt, no repeated Update
        val report=go("goview_transfer_receipt",JSONObject().put("transferId",p.transferId))
        assertTrue(report.getBoolean("ok"));assertFalse(report.getBoolean("independentlyVerified"));assertTrue(report.getJSONObject("receipt").getBoolean("readbackVerified"))

        screen.launchActivity(null);await("Studio ready"){js("Boolean(window.GoviewEngine && window.GoviewStudio)")==true}
        val id="synthetic_typed_${System.nanoTime()}"
        val raw=(js("(()=>{const m=GoviewEngine.demo();m.mapId='$id';return GoviewEngine.pack(m)})()") as String)+"\n"
        val e=GoviewTransfer.parse(GoviewTransfer("${id}_transfer","STUDIO","goview.map.package.v1",JSONObject().put("mapId",id).put("version",1),GoviewTransfer.digest(raw),raw).json())
        assertTrue(go("goview_transfer_publish",JSONObject().put("envelope",JSONObject(e.json()))).getBoolean("ok"))
        val studio=studioExchange()
        val downloaded=studio.download(e.transferId,id,1,e.sha256);assertEquals(e.payload,downloaded.payload);assertEquals(e.sha256,downloaded.sha256)
        val file=File(context.filesDir,"goview-studio-maps/$id.goview.json");assertFalse(file.exists())
        val studioReceipt=File(context.filesDir,"goview-transfers/${e.transferId}.json")
        assertTrue(runCatching {studio.report(e.transferId)}.isFailure)
        js("GoviewStudio.receiveImport("+JSONObject.quote(downloaded.payload)+");true")
        await("Studio preview before owner confirmation"){js("document.getElementById('modal').classList.contains('open')")==true}
        assertFalse(file.exists());assertEquals(saved,map.load())
        js("document.getElementById('modalOk').click();true")
        await("Native exact Studio save/readback"){file.exists()&&file.readText()==raw&&JSONObject(studioReceipt.readText()).optString("status")=="OWNER_APPROVED_FILE_READBACK_VERIFIED"}
        assertEquals(e.sha256,JSONObject(studioReceipt.readText()).getString("readbackSha256"));assertEquals(saved,map.load())
        studio.report(e.transferId)
        val studioReport=go("goview_transfer_receipt",JSONObject().put("transferId",e.transferId))
        assertTrue(studioReport.getBoolean("ok"));assertFalse(studioReport.getBoolean("independentlyVerified"))
        checkpoint.writeText(JSONObject().put("pid",Process.myPid()).put("snapshot",s.transferId).put("proposal",p.transferId).put("revision",saved.state.revision).put("receipt",receipt.id).put("studio",e.json()).toString())
    }
    private fun after() {
        val expected=JSONObject(checkpoint.readText());assertNotEquals(expected.getInt("pid"),Process.myPid())
        val saved=map.load();assertEquals(expected.getLong("revision"),saved.state.revision);assertEquals(3,saved.state.pins.size)
        assertTrue(saved.state.notes.values.contains("PRIVATE synthetic owner note"))
        val receipt=saved.updates.single {it.id==expected.getString("receipt")};assertTrue(receipt.readbackVerified)
        val x=exchange();x.report(receipt);assertEquals(saved,map.load())
        assertTrue(runCatching {x.download(expected.getString("snapshot"))}.isFailure);assertEquals(saved,map.load())
        val report=go("goview_transfer_receipt",JSONObject().put("transferId",expected.getString("proposal")))
        assertTrue(report.getBoolean("ok"));assertFalse(report.getBoolean("independentlyVerified"))
        val e=GoviewTransfer.parse(expected.getString("studio"))
        val file=File(context.filesDir,"goview-studio-maps/${e.identity.getString("mapId")}.goview.json")
        assertEquals(e.payload,file.readText());assertEquals(e.sha256,GoviewTransfer.digest(file.readText()))
        studioExchange().report(e.transferId)
        assertTrue(go("goview_transfer_receipt",JSONObject().put("transferId",e.transferId)).getBoolean("ok"));assertEquals(saved,map.load())
    }
}
