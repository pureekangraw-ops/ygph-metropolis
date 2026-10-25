package com.big.gobrowser.transport

import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import org.json.JSONObject

/** Metadata survives application-level validation without retaining unsafe error text. */
class StationResponse(val body:String,val httpStatus:Int,val requestId:String?,val correlationConfirmed:Boolean) {
    fun <T> validate(parse:(String)->T):T = try { parse(body) } catch(error:Exception) {
        throw StationFailure(httpStatus,StationDiagnostics.safeFailure(error),requestId,correlationConfirmed)
    }
}

object StationHttp {
    fun request(endpoint:String,method:String="POST",body:JSONObject?=null,token:String?=null,requestId:String?=null):String {
        return requestResponse(endpoint,method,body,token,requestId).body
    }
    fun requestResponse(endpoint:String,method:String="POST",body:JSONObject?=null,token:String?=null,requestId:String?=null):StationResponse {
        val uri=URI(endpoint);require(uri.scheme=="https"&&uri.userInfo==null&&uri.host!=null&&uri.fragment==null)
        val connection=URL(endpoint).openConnection() as HttpURLConnection
        return requestResponse(connection,method,body,token,requestId)
    }
    internal fun requestResponse(connection:HttpURLConnection,method:String,body:JSONObject?,token:String?,requestId:String?):StationResponse {
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
            val confirmed=correlation!=null && connection.getHeaderField("X-Request-ID")==correlation
            val payload=try { connection.inputStream.use { StationDiagnostics.readBounded(it,65536) } }
                catch(error:Exception) {
                    val code=if(error is IllegalArgumentException && error.message=="STATION_RESPONSE_TOO_LARGE")
                        "STATION_RESPONSE_TOO_LARGE" else "STATION_RESPONSE_READ_FAILED"
                    throw StationFailure(status,code,correlation,confirmed)
                }
            return StationResponse(payload,status,correlation,confirmed)
        } finally {connection.disconnect()}
    }
}
