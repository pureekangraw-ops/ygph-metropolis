package com.big.gobrowser.transport

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.text.InputType
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.util.UUID
import java.util.concurrent.Executors

class ObservatoryStationConnection(context:Context,settingsName:String="observatory-station",keyAlias:String="observatory-station-token",credentialName:String="observatory-station-credential") {
    private val settings=context.applicationContext.getSharedPreferences(settingsName,Context.MODE_PRIVATE)
    private val credential=AndroidDeviceCredentialStore(context,keyAlias,credentialName)
    fun saved():JSONObject?=settings.getString("connection",null)?.let {runCatching {JSONObject(it)}.getOrNull()}
    fun token()=credential.load()
    fun config(view:String)=saved()?.optJSONObject(if(view=="browser")"browser" else "map")
    fun stop(view:String,epoch:Long) {val c=config(view)?:return;val endpoint=c.optString("stopSharing");if(endpoint.isNotBlank())StationHttp.request(endpoint,body=JSONObject().put("view",view).put("epoch",epoch),token=token())}
    /** Local revoke happens before waiting for network; Activity destruction cannot restore it. */
    fun revokeLocally():()->Unit {
        val c=config("browser")?:config("map");val t=token()
        check(settings.edit().remove("connection").commit());credential.revoke()
        val endpoint=c?.optString("disconnect").orEmpty()
        return {if(endpoint.isNotBlank()&&t!=null)runCatching {StationHttp.request(endpoint,body=JSONObject(),token=t)};Unit}
    }
    fun disconnect()=revokeLocally().invoke()
    fun pair(activity:Activity,connected:(OwnerRelayConfiguration,String)->Unit) {
        val form=LinearLayout(activity).apply {orientation=LinearLayout.VERTICAL;setPadding(24,12,24,12)}
        val origin=EditText(activity).apply {hint="ที่อยู่เมโทร";setSingleLine();setText("https://metropolis.pureekangraw.workers.dev")}
        val passcode=EditText(activity).apply {hint="รหัสเจ้าของเมโทร";inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD}
        val consent=CheckBox(activity).apply {text="ให้โกอ่านและจัดการหน้าเว็บ/แผนที่ เฉพาะตอนเปิดแชร์"}
        form.addView(origin);form.addView(passcode);form.addView(consent)
        AlertDialog.Builder(activity).setTitle("เชื่อมหอดูดาวกับเมโทร").setView(form).setNegativeButton("ยกเลิก",null).setPositiveButton("เชื่อมต่อ"){_,_->
            if(!consent.isChecked){Toast.makeText(activity,"เลือกสิทธิ์ที่ต้องการเปิดให้โกก่อนครับ",Toast.LENGTH_LONG).show();return@setPositiveButton}
            val secret=passcode.text.toString();passcode.text.clear()
            val base=origin.text.toString().trim().trimEnd('/')
            val valid=runCatching {val u=URI(base);require(u.scheme=="https"&&u.host!=null&&u.userInfo==null&&u.rawQuery==null&&u.fragment==null&&u.path.isNullOrEmpty());base}.getOrNull()
            if(valid==null||secret.isBlank()){Toast.makeText(activity,"ตรวจที่อยู่เมโทรและรหัสเจ้าของครับ",Toast.LENGTH_LONG).show();return@setPositiveButton}
            val device=settings.getString("device",null)?:UUID.randomUUID().toString().also {settings.edit().putString("device",it).apply()}
            val scopes=JSONArray();listOf("observe","click","fill","scroll","navigate","back","forward","reload").forEach {scopes.put("browser.$it")};listOf("observe","upsert_zone","upsert_grid","upsert_pin","note","recommend","highlight","focus","remove","clear").forEach {scopes.put("map.$it")}
            val worker=Executors.newSingleThreadExecutor()
            worker.execute {
                val result=runCatching {
                    val response=JSONObject(StationHttp.request("$valid/observatory/pair",body=JSONObject().put("deviceId",device).put("passcode",secret).put("actor","GO").put("authorities",scopes)))
                    val browser=response.getJSONObject("browser");val config=OwnerRelayConfiguration.parse(browser.toString());require(config.deviceId==device)
                    val token=response.getString("token");credential.save(token);response.remove("token");settings.edit().putString("connection",response.toString()).apply()
                    config to token
                }
                activity.runOnUiThread {if(!activity.isFinishing)result.onSuccess {(c,t)->connected(c,t)}.onFailure {Toast.makeText(activity,"เชื่อมเมโทรไม่ได้: ${it.message?.take(120)}",Toast.LENGTH_LONG).show()}}
                worker.shutdown()
            }
        }.show()
    }
}
