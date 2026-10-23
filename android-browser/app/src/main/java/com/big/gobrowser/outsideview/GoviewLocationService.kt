package com.big.gobrowser.outsideview

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.*
import android.os.*

/** Owner-started location session. One latest fix in RAM; no history, file, network or automatic restart. */
class GoviewLocationService:android.app.Service() {
    private lateinit var manager:LocationManager
    private val handler=Handler(Looper.getMainLooper())
    private var subscribed=false
    private val listener=object:LocationListener {
        override fun onLocationChanged(location:Location) {
            val age=(SystemClock.elapsedRealtimeNanos()-location.elapsedRealtimeNanos)/1_000_000
            if(location.hasAccuracy() && LocationFixPolicy.accepts(location.longitude,location.latitude,location.accuracy,age))latest=Location(location)
            refresh()
        }
        override fun onProviderDisabled(provider:String){refresh()}
        override fun onProviderEnabled(provider:String){refresh()}
        @Deprecated("Legacy callback") override fun onStatusChanged(provider:String?,status:Int,extras:Bundle?)=Unit
    }
    private val tick=object:Runnable {override fun run(){refresh();if(running)handler.postDelayed(this,10_000)}}
    override fun onCreate(){super.onCreate();manager=getSystemService(LocationManager::class.java)
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL,"GOVIEW · GPS session",NotificationManager.IMPORTANCE_LOW))
    }
    override fun onBind(intent:Intent?)=null
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action!=START){finishSession("หยุด GPS ต่อเนื่องแล้ว");return START_NOT_STICKY}
        if(running)return START_NOT_STICKY
        if(!permissions() || !locationEnabled()){finishSession("ไม่ได้เริ่ม · ต้องอนุญาตตำแหน่งและการแจ้งเตือน");return START_NOT_STICKY}
        try {
            description="GPS ต่อเนื่อง · กำลังรอตำแหน่ง · ไม่บันทึกประวัติหรือส่งข้อมูล"
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            else startForeground(NOTIFICATION,notification())
            val providers=listOf(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER).filter {manager.isProviderEnabled(it)}
            check(providers.isNotEmpty()){"Location providers disabled"}
            providers.forEach {manager.requestLocationUpdates(it,5_000L,5f,listener,Looper.getMainLooper());subscribed=true}
            running=true;handler.post(tick)
        }catch(error:Exception){finishSession("เริ่ม GPS ต่อเนื่องไม่ได้ · เปิดแอปและตรวจสิทธิ์ก่อนลองใหม่")}
        return START_NOT_STICKY
    }
    private fun locationEnabled()=if(Build.VERSION.SDK_INT>=28)manager.isLocationEnabled else manager.isProviderEnabled(LocationManager.GPS_PROVIDER)||manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    private fun permissions():Boolean =
        (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) &&
        (Build.VERSION.SDK_INT<33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED) && getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    private fun refresh() {
        if(!permissions() || !locationEnabled()){finishSession("GPS ต่อเนื่องหยุด · สิทธิ์หรือบริการตำแหน่งเปลี่ยน");return}
        val fix=currentFix()
        description=if(fix==null)"GPS ต่อเนื่อง · ยังไม่มีตำแหน่งสด · ไม่บันทึกประวัติ" else
            "GPS ต่อเนื่อง · ±${fix.accuracy.toInt()} ม. · ล่าสุด ${java.text.DateFormat.getTimeInstance().format(java.util.Date(fix.time))}"
        if(running)getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification())
    }
    private fun notification():Notification {
        val stop=PendingIntent.getService(this,710,Intent(this,GoviewLocationService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val open=PendingIntent.getActivity(this,711,Intent(this,OutsideViewActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("GOVIEW · GPS ที่คุณเริ่มไว้")
            .setContentText(description).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
            .addAction(Notification.Action.Builder(null,"หยุด GPS",stop).build()).build()
    }
    private fun finishSession(message:String){description=message;running=false;latest=null;handler.removeCallbacks(tick);if(subscribed){runCatching {manager.removeUpdates(listener)};subscribed=false};stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
    override fun onTaskRemoved(rootIntent:Intent?){finishSession("หยุด GPS เมื่อปิดงานแอป");super.onTaskRemoved(rootIntent)}
    override fun onDestroy(){running=false;latest=null;handler.removeCallbacksAndMessages(null);if(subscribed)runCatching {manager.removeUpdates(listener)};super.onDestroy()}
    companion object {
        const val START="com.big.gobrowser.goview.START_LOCATION_SESSION"
        const val STOP="com.big.gobrowser.goview.STOP_LOCATION_SESSION"
        private const val CHANNEL="goview-location-session"
        const val NOTIFICATION=710
        @Volatile var running=false;private set
        @Volatile var description="GPS ต่อเนื่องปิดอยู่";private set
        @Volatile private var latest:Location?=null
        fun currentFix():Location?=latest?.let {fix->
            val age=(SystemClock.elapsedRealtimeNanos()-fix.elapsedRealtimeNanos)/1_000_000
            if(fix.hasAccuracy() && LocationFixPolicy.accepts(fix.longitude,fix.latitude,fix.accuracy,age))Location(fix) else null
        }
    }
}
