package com.big.gobrowser.outsideview

import android.app.Activity
import android.app.AlertDialog
import android.os.Handler
import android.widget.*
import java.util.concurrent.ExecutorService

/** Explicit owner actions only. Existing map preview is the sole commit entry point. */
class GoviewTransferUi(private val host:Activity,private val store:MapStateStore,private val exchange:GoviewSelectedTransfer,
    private val client:GoviewTransferClient,private val worker:ExecutorService,private val handler:Handler,
    private val alive:()->Boolean,private val status:(String)->Unit,private val select:()->Unit,private val preview:(MapUpdatePreview)->Unit) {
    fun show() {
        AlertDialog.Builder(host).setTitle("GOVIEW · ส่งข้อมูลที่เลือกให้ GO")
            .setItems(arrayOf("เลือกหมุดแล้ว Upload", "Snapshot ที่เลือก · ตรวจ Upload / Download", "ส่ง Receipt ที่บันทึกแล้วอีกครั้ง", "ตั้งค่าสิทธิ์ Upload / Read")){_,i->
                when(i){0->select();1->captures();2->receipts();3->settings()}
            }.setNegativeButton("ปิด",null).show()
    }
    private fun settings() {
        val form=LinearLayout(host).apply {orientation=LinearLayout.VERTICAL}
        fun field(label:String)=EditText(host).apply {hint=label;inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD;setSingleLine();form.addView(this)}
        val upload=field("Android upload token · แยกจาก GO key");val read=field("Android read token")
        AlertDialog.Builder(host).setTitle("สิทธิ์ส่ง Snapshot ที่เลือก")
            .setMessage("บันทึกคีย์อุปกรณ์สองสิทธิ์แยกกัน · ไม่ใช้ GO write token · ยังไม่ส่งข้อมูลหรือตรวจบริการจนกดทำรายการ")
            .setView(form).setNegativeButton("ยกเลิก",null).setPositiveButton("บันทึกคีย์"){_,_->
                val u=upload.text.toString().trim();val r=read.text.toString().trim();upload.text.clear();read.text.clear()
                worker.execute {val saved=runCatching {client.saveCredentials(u,r)};handler.post {if(alive())status(if(saved.isSuccess)"บันทึกคีย์แล้ว · ยังไม่ยืนยันบริการ" else "บันทึกคีย์ไม่ครบ · ตรวจและบันทึกใหม่")}}
            }.create().also {dialog->dialog.setOnDismissListener {upload.text.clear();read.text.clear()};dialog.show()}
    }
    fun upload(snapshot:SelectedSnapshot) {
        status("SNAPSHOT CAPTURED_LOCAL · กำลัง Upload เฉพาะหมุดที่เลือก")
        worker.execute {val sent=runCatching {exchange.upload(snapshot)};handler.post {if(alive())sent.onSuccess {details(it)}.onFailure {status("Upload ยังไม่ยืนยัน · ใช้ Snapshot ที่เลือก → ตรวจ Upload ก่อนลองส่งซ้ำ · "+directSafeError(it))}}}
    }
    private fun captures() {
        worker.execute {val items=exchange.captures();handler.post {if(alive())AlertDialog.Builder(host).setTitle("Snapshot ที่เลือกไว้")
            .setItems(items.map {it.transferId+" · v"+it.identity.getLong("baseVersion")}.toTypedArray()){_,i->
                val capture=items[i]
                AlertDialog.Builder(host).setTitle(capture.transferId).setItems(arrayOf("ตรวจ Upload แบบอ่านอย่างเดียว","Download ข้อเสนอจาก GO","คัดลอกข้อมูลอ้างอิง")){_,choice->
                    when(choice){
                        0->worker.execute {val checked=runCatching {exchange.verifyUpload(capture.transferId)};handler.post {if(alive())checked.onSuccess {details(it)}.onFailure {status("Upload ยังไม่ยืนยัน · ไม่ส่งซ้ำอัตโนมัติ · "+directSafeError(it))}}}
                        1->worker.execute {val downloaded=runCatching {exchange.download(capture.transferId)};handler.post {if(alive())downloaded.onSuccess {preview(it)}.onFailure {status("Download/Preview ไม่ผ่าน · หมุดเดิมยังอยู่ · "+directSafeError(it))}}}
                        2->details(capture)
                    }
                }.setNegativeButton("ปิด",null).show()
            }.setNegativeButton("ปิด",null).show()}}
    }
    private fun details(e:GoviewTransfer) {
        val text="captureId: ${e.transferId}\nbaseVersion: ${e.identity.getLong("baseVersion")}\nsha256: ${e.sha256}"
        status("ตรวจ Upload ได้จากเมนู Snapshot · การส่งไม่ใช่ Update")
        AlertDialog.Builder(host).setTitle("ข้อมูลอ้างอิง Snapshot ที่เลือก").setMessage(text+"\nให้ GO อ่าน artifact นี้เท่านั้น · Receipt บนเครื่องแสดงผลตรวจ Upload")
            .setPositiveButton("คัดลอกให้ GO"){_,_->(host.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("Selected GOVIEW artifact",text))}
            .setNegativeButton("ปิด",null).show()
    }
    private fun receipts() {
        worker.execute {val items=runCatching {store.load().updates.filter {it.operation=="UPDATE"&&it.correlationId.endsWith("-proposal")}}.getOrDefault(emptyList())
            handler.post {if(alive())AlertDialog.Builder(host).setTitle("ส่งเฉพาะ Receipt · ไม่ทำ Update ซ้ำ")
                .setItems(items.map {it.correlationId+" · "+it.status}.toTypedArray()){_,i->report(items[i])}.setNegativeButton("ปิด",null).show()}}
    }
    fun report(receipt:MapUpdateReceipt) {
        worker.execute {val sent=runCatching {exchange.report(receipt)};handler.post {if(alive())Toast.makeText(host,
            if(sent.isSuccess)"ส่ง Receipt แล้ว · ไม่เปลี่ยนหมุดเพิ่ม" else "ผล Update อยู่บนเครื่อง · Receipt ยังส่งไม่ได้ · ลองส่งเฉพาะ Receipt ภายหลัง",Toast.LENGTH_LONG).show()}}
    }
}
