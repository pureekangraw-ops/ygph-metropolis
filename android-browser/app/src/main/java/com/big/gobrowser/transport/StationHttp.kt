package com.big.gobrowser.transport

import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import org.json.JSONObject

object StationHttp {
    fun request(endpoint:String,method:String="POST",body:JSONObject?=null,token:String?=null,requestId:String?=null):String {
        val uri=URI(endpoint);require(uri.scheme=="https"&&uri.userInfo==null&&uri.host!=null&&uri.fragment==null)
        val connection=URL(endpoint).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects=false;connection.requestMethod=method;connection.connectTimeout=8000;connection.readTimeout=20000
            connection.setRequestProperty("Accept","application/json")
            val correlation=StationDiagnostics.requestId(requestId)
            correlation?.let {connection.setRequestProperty("X-Request-ID",it)}
            token?.let {connection.setRequestProperty("Authorization","Bearer $it")}
            if(body!=null){val data=body.toString().toByteArray(Charsets.UTF_8);require(data.size<=65536);connection.doOutput=true;connection.setRequestProperty("Content-Type","application/json");connection.outputStream.use {it.write(data)}}
            val status=connection.responseCode
            if (status !in 200..299) throw StationDiagnostics.failure(status,connection.errorStream,correlation,correlation!=null && connection.getHeaderField("X-Request-ID")==correlation)
            if (correlation!=null && connection.getHeaderField("X-Request-ID")!=correlation)
                throw StationFailure(status,"STATION_CORRELATION_UNVERIFIED",correlation)
            return connection.inputStream.use { StationDiagnostics.readBounded(it,65536) }
        } finally {connection.disconnect()}
    }
}
