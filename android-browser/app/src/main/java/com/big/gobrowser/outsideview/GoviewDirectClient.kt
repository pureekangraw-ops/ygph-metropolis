package com.big.gobrowser.outsideview

import android.content.Context
import com.big.gobrowser.transport.AndroidDeviceCredentialStore
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Direct GO proposals via existing GOVIEW Cloudflare bridge.
 * Never uploads live GPS, saved pins or local map data. No automatic map write.
 */
data class GoviewDirectProposal(
    val commandId: String,
    val type: String,
    val point: Point,
    val label: String?,
    val expectedRevision: Long?
) {
    companion object {
        private val idPattern=Regex("[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}",RegexOption.IGNORE_CASE)
        fun parse(raw: JSONObject): GoviewDirectProposal {
            require(raw.getString("schema")=="goview.direct-command.v1")
            val id=raw.getString("commandId").also {require(idPattern.matches(it))}
            val type=raw.getString("type").also {require(it in setOf("POINT_FOCUS","PIN_PROPOSAL"))}
            val p=raw.getJSONObject("point")
            val point=Point(p.getDouble("longitude"),p.getDouble("latitude"))
            val label=if(type=="PIN_PROPOSAL")raw.getString("label").trim().also {require(it.length in 1..140)} else null
            val revision=if(raw.has("expectedRevision"))raw.getLong("expectedRevision").also {require(it>=0)} else null
            return GoviewDirectProposal(id.lowercase(),type,point,label,revision)
        }
    }
}

class GoviewDirectClient(context: Context) {
    private val credential=AndroidDeviceCredentialStore(context,"goview-direct-android-key","goview-direct-android-credential")
    private val client=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(10,TimeUnit.SECONDS).readTimeout(12,TimeUnit.SECONDS).build()
    private val base="https://goview-package-bridge.pureekangraw.workers.dev"
    private val json="application/json; charset=utf-8".toMediaType()

    fun configured()=!credential.load().isNullOrBlank()
    fun configure(token:String){
        require(token.length in 20..512 && token.all {it>' '&&it!='\u007f'})
        credential.save(token)
    }
    fun disconnect()=credential.revoke()

    private fun call(path:String,body:JSONObject?=null):JSONObject {
        require(path.startsWith("/v1/direct/commands"))
        val token=credential.load() ?: error("DIRECT_CONNECTION_NOT_CONFIGURED")
        val builder=Request.Builder().url(base+path).header("Authorization","Bearer "+token)
            .header("Cache-Control","no-store")
        if(body==null)builder.get()
        else builder.post(body.toString().toRequestBody(json))
        client.newCall(builder.build()).execute().use {response->
            if(!response.isSuccessful)error("DIRECT_HTTP_"+response.code)
            val text=response.body?.string() ?: error("EMPTY_DIRECT_RESPONSE")
            require(text.length<=16384){"DIRECT_RESPONSE_TOO_LARGE"}
            val result=JSONObject(text)
            check(result.optBoolean("ok")){"DIRECT_RESPONSE_REJECTED"}
            return result
        }
    }
    /** Must run off the UI thread and only while GOVIEW is visible. */
    fun pending():List<GoviewDirectProposal>{
        val response=call("/v1/direct/commands/pending")
        val array=response.getJSONArray("commands")
        require(array.length()<=5)
        return (0 until array.length()).map { GoviewDirectProposal.parse(array.getJSONObject(it)) }
    }

    /** This is a device report, not a claim GO's proposal was accepted upon queuing. */
    fun receipt(proposal:GoviewDirectProposal,status:String,revision:Long,readback:Boolean){
        require(status in setOf("APPLIED","DISPLAY_REQUESTED","DECLINED","FAILED"))
        require(status!="APPLIED"||readback)
        val message=JSONObject().put("commandId",proposal.commandId).put("status",status)
            .put("revision",revision).put("readbackVerified",readback)
        call("/v1/direct/commands/"+proposal.commandId+"/receipt",message)
    }
}
