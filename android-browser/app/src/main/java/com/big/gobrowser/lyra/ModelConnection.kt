package com.big.gobrowser.lyra

import android.content.Context
import com.big.gobrowser.transport.AndroidDeviceCredentialStore
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

class ModelConnection(context:Context) {
    private val settings=context.applicationContext.getSharedPreferences("lyra-model",Context.MODE_PRIVATE)
    private val credentials=AndroidDeviceCredentialStore(context,"observatory-lyra-model","lyra-model-credential")
    fun configuration():ModelConfiguration?=settings.getString("config",null)?.let {runCatching {ModelConfiguration.decode(it)}.getOrNull()}
    fun configured()=configuration()!=null && credentials.load()!=null
    fun save(config:ModelConfiguration,token:String){credentials.save(token);settings.edit().putString("config",config.encode()).apply()}
    fun disconnect(){settings.edit().clear().apply();credentials.revoke()}
    fun ask(request:JSONObject):JSONObject {
        val config=configuration()?:error("MODEL_NOT_CONFIGURED");val token=credentials.load()?:error("MODEL_NOT_CONFIGURED")
        val message=JSONObject().put("text",request.getString("text")).put("context",request.getJSONObject("context"))
        val body=JSONObject().put("model",config.model).put("messages",JSONArray().put(JSONObject().put("role","system").put("content",request.getString("system"))).put(JSONObject().put("role","user").put("content",message.toString()))).put("max_tokens",500)
        require(body.toString().toByteArray().size<=64*1024)
        val c=URL(config.endpoint).openConnection() as HttpURLConnection
        try {
            c.instanceFollowRedirects=false;c.connectTimeout=8000;c.readTimeout=20000;c.requestMethod="POST";c.doOutput=true
            c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Authorization","Bearer $token")
            c.outputStream.use {it.write(body.toString().toByteArray(Charsets.UTF_8))}
            require(c.responseCode in 200..299){"MODEL_HTTP_ERROR"}
            val bytes=c.inputStream.use {input->val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(4096);var n=input.read(buffer);while(n>=0){require(out.size()+n<=65536){"MODEL_RESPONSE_TOO_LARGE"};if(n>0)out.write(buffer,0,n);n=input.read(buffer)};out.toByteArray()}
            val response=JSONObject(bytes.toString(Charsets.UTF_8));val content=response.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")
            require(content.length<=4000)
            return JSONObject(content)
        } finally {c.disconnect()}
    }
}
