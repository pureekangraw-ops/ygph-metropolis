package com.big.gobrowser.transport

import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import org.json.JSONObject

object StationHttp {
    fun request(endpoint:String,method:String="POST",body:JSONObject?=null,token:String?=null):String {
        val uri=URI(endpoint);require(uri.scheme=="https"&&uri.userInfo==null&&uri.host!=null&&uri.fragment==null)
        val connection=URL(endpoint).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects=false;connection.requestMethod=method;connection.connectTimeout=8000;connection.readTimeout=20000
            connection.setRequestProperty("Accept","application/json")
            token?.let {connection.setRequestProperty("Authorization","Bearer $it")}
            if(body!=null){val data=body.toString().toByteArray(Charsets.UTF_8);require(data.size<=65536);connection.doOutput=true;connection.setRequestProperty("Content-Type","application/json");connection.outputStream.use {it.write(data)}}
            require(connection.responseCode in 200..299){"STATION_HTTP_${connection.responseCode}"}
            return connection.inputStream.use {input->val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(4096);var n=input.read(buffer);while(n>=0){require(out.size()+n<=65536){"STATION_RESPONSE_TOO_LARGE"};if(n>0)out.write(buffer,0,n);n=input.read(buffer)};out.toString("UTF-8")}
        } finally {connection.disconnect()}
    }
}
