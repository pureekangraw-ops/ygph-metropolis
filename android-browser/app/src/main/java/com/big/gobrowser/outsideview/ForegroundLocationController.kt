package com.big.gobrowser.outsideview

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/** PRISM RideMap's foreground-only provider flow; GPS fixes never become owner-selected pins. */
class ForegroundLocationController(private val activity:Activity,private val fix:(Location?)->Unit,private val status:(String)->Unit) {
    private val manager=activity.getSystemService(LocationManager::class.java)
    private val handler=Handler(Looper.getMainLooper())
    private var requested=false
    private var foreground=false
    private var subscribed=false
    private var latest:Location?=null
    private var recenter=false
    var onCenter:(Point)->Unit={}
    private val expire=object:Runnable {override fun run(){
        if(!foreground || !requested)return
        latest?.let {if(!valid(it)){latest=null;fix(null);status("ตำแหน่งเก่าแล้ว · กำลังรอตำแหน่งใหม่")}}
        handler.postDelayed(this,5_000)
    }}
    private val listener=object:LocationListener {
        override fun onLocationChanged(location:Location){accept(location)}
        override fun onProviderDisabled(provider:String){stopUpdates();latest=null;fix(null);status("บริการตำแหน่งเปลี่ยน · กดตำแหน่งฉันเพื่อลองใหม่")}
        override fun onProviderEnabled(provider:String)=Unit
        @Deprecated("Legacy provider callback") override fun onStatusChanged(provider:String?,status:Int,extras:Bundle?)=Unit
    }
    fun request(){
        requested=true;recenter=true
        if(!permission())activity.requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),REQUEST_CODE)
        else startUpdates()
    }
    fun permissionResult(){if(permission())startUpdates() else {requested=false;status("ไม่ได้อนุญาตตำแหน่ง · ยังเลือกจุดบนแผนที่เองได้")}}
    fun resume(){foreground=true;if(requested && permission())startUpdates()}
    fun pause(){foreground=false;stopUpdates();latest=null;fix(null)}
    private fun permission()=activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED || activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
    private fun valid(location:Location):Boolean {
        val age=(SystemClock.elapsedRealtimeNanos()-location.elapsedRealtimeNanos)/1_000_000
        return location.hasAccuracy() && LocationFixPolicy.accepts(location.longitude,location.latitude,location.accuracy,age)
    }
    private fun accept(location:Location){
        if(!foreground || !requested || !valid(location))return
        latest=Location(location);fix(latest)
        @Suppress("DEPRECATION") val simulated=location.isFromMockProvider
        status("${if(simulated)"ตำแหน่งจำลอง" else "ตำแหน่งจากเครื่อง"} · คลาดเคลื่อนประมาณ ${location.accuracy.toInt()} ม.")
        if(recenter){recenter=false;onCenter(Point(location.longitude,location.latitude))}
    }
    private fun startUpdates(){
        if(!foreground || !requested || !permission())return
        stopUpdates()
        try {
            val providers=listOf(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER).filter {manager.isProviderEnabled(it)}
            if(providers.isEmpty()){status("เปิดบริการตำแหน่งในเครื่อง แล้วกดตำแหน่งฉันอีกครั้ง");return}
            status("กำลังหาตำแหน่งจากเครื่อง…")
            providers.forEach {provider->manager.requestLocationUpdates(provider,2_000L,5f,listener,Looper.getMainLooper());subscribed=true}
            providers.mapNotNull {manager.getLastKnownLocation(it)}.filter(::valid).maxByOrNull {it.elapsedRealtimeNanos}?.let(::accept)
            handler.post(expire)
        } catch(error:SecurityException){stopUpdates();status("สิทธิ์ตำแหน่งถูกเปลี่ยน · กดตำแหน่งฉันอีกครั้ง")}
    }
    private fun stopUpdates(){handler.removeCallbacks(expire);if(subscribed){runCatching {manager.removeUpdates(listener)};subscribed=false}}
    companion object {const val REQUEST_CODE=41}
}
