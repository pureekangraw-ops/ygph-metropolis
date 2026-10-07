package com.big.gobrowser.outsideview

import org.json.JSONObject
import java.net.URI
import java.util.Locale

data class MapRelayConfiguration(val publishSnapshots:String,val pollCommands:String,val publishReceipts:String,val deviceId:String,val workId:String,val checkpointId:String,val actor:String,val authorities:Set<String>) {
    companion object {
        fun parse(o:JSONObject):MapRelayConfiguration {
            fun url(key:String):String=o.getString(key).also {val u=URI(it);require(u.scheme=="https"&&u.host!=null&&u.userInfo==null&&u.fragment==null&&u.rawQuery==null)}
            val authorities=o.getJSONArray("authorities");val scopes=(0 until authorities.length()).map {authorities.getString(it)}.toSet()
            val allowed=MapAction.values().filter {it!=MapAction.ROUTE}.map {"map.${it.name.lowercase(Locale.ROOT)}"}.toSet()+"map.observe"
            require(scopes.all {it in allowed}&&"map.observe" in scopes)
            val actor=o.getString("actor");require(actor in setOf("GO","LIGHT"))
            return MapRelayConfiguration(url("publishSnapshots"),url("pollCommands"),url("publishReceipts"),o.getString("deviceId"),o.getString("workId"),o.getString("checkpointId"),actor,scopes).also {require(listOf(it.deviceId,it.workId,it.checkpointId).all(String::isNotBlank))}
        }
    }
}
data class MapRelayCapture(val id:String,val revision:Long,val epoch:Long,val capturedAt:Long)
data class MapRelayEnvelope(val command:MapCommand,val actor:String,val deviceId:String,val workId:String,val checkpointId:String,val captureId:String,val revision:Long,val epoch:Long,val issuedAt:Long,val expiresAt:Long,val authority:String) {
    fun identity():String=JSONObject().put("command",MapCommandCodec.encode(command)).put("actor",actor).put("deviceId",deviceId).put("workId",workId).put("checkpointId",checkpointId).put("captureId",captureId).put("revision",revision).put("epoch",epoch).put("issuedAt",issuedAt).put("expiresAt",expiresAt).put("authority",authority).toString()
    companion object {
        fun decode(o:JSONObject):MapRelayEnvelope {
            require(o.toString().toByteArray(Charsets.UTF_8).size<=8192)
            val allowed=setOf("commandId","actor","deviceId","workId","checkpointId","captureId","revision","epoch","issuedAtEpochMs","expiresAtEpochMs","authority","command")
            require(o.keys().asSequence().toSet()==allowed)
            fun integer(v:Any):Boolean=v is Number&&v.toDouble().isFinite()&&v.toDouble()>=0&&v.toDouble()<=9007199254740991.0&&v.toDouble()==v.toLong().toDouble()
            listOf("revision","epoch","issuedAtEpochMs","expiresAtEpochMs").forEach {require(integer(o.get(it)))}
            val nested=o.getJSONObject("command");require(!nested.isNull("expectedRevision")&&integer(nested.get("expectedRevision")))
            val command=MapCommandCodec.decode(nested);require(command.commandId==o.getString("commandId"))
            return MapRelayEnvelope(command,o.getString("actor"),o.getString("deviceId"),o.getString("workId"),o.getString("checkpointId"),o.getString("captureId"),o.getLong("revision"),o.getLong("epoch"),o.getLong("issuedAtEpochMs"),o.getLong("expiresAtEpochMs"),o.getString("authority"))
        }
    }
}
object MapRelayGuard {
    fun rejection(e:MapRelayEnvelope,c:MapRelayConfiguration,s:MapRelayCapture?,now:Long,foreground:Boolean,interactive:Boolean):String? {
        if(!foreground||!interactive)return "MAP_NOT_FOREGROUND_INTERACTIVE"
        if(s==null)return "NO_SHARED_CAPTURE"
        if(e.deviceId!=c.deviceId||e.workId!=c.workId||e.checkpointId!=c.checkpointId||e.actor!=c.actor)return "OWNER_CONTEXT_MISMATCH"
        if(e.captureId!=s.id||e.revision!=s.revision||e.epoch!=s.epoch||e.command.expectedRevision!=e.revision)return "CAPTURE_CONTEXT_MISMATCH"
        if(now-s.capturedAt !in -5000L..30000L)return "STALE_CAPTURE"
        if(e.issuedAt<0||e.expiresAt<=e.issuedAt||e.expiresAt-e.issuedAt>30000||e.issuedAt>now||now>=e.expiresAt)return "COMMAND_EXPIRED_OR_INVALID_TIME"
        if(e.command.action==MapAction.ROUTE)return "ROUTE_DISABLED"
        if(e.authority!="map.${e.command.action.name.lowercase(Locale.ROOT)}"||e.authority !in c.authorities)return "AUTHORITY_DENIED"
        return null
    }
}
