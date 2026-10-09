package com.big.gobrowser.ui

enum class SharingState(val label:String) {
    STOPPED("เชื่อมต่อแล้ว · ยังไม่ได้แชร์"), UNPAIRED("ยังไม่ได้จับคู่กับงานหอดูดาว"), WAITING("กำลังรอเมืองรับข้อมูล"),
    LIVE("กำลังแชร์ · เมืองรับข้อมูลล่าสุดแล้ว"), BACKGROUND("ทำงานเบื้องหลัง · หยุดแชร์ชั่วคราว"),
    STALE("ข้อมูลล่าสุดหมดอายุ · รอข้อมูลใหม่"), OFFLINE("ไม่มีอินเทอร์เน็ต · ส่งข้อมูลไม่ได้")
}

object SharingStatus {
    fun resolve(sharing:Boolean,paired:Boolean,foreground:Boolean,online:Boolean,fresh:Boolean,lastAck:Long?,failed:Boolean,now:Long):SharingState {
        if(!foreground)return SharingState.BACKGROUND
        if(!paired)return SharingState.UNPAIRED
        if(!sharing)return SharingState.STOPPED
        if(!online)return SharingState.OFFLINE
        if(failed || lastAck==null)return SharingState.WAITING
        if(!fresh || now-lastAck !in 0..30_000)return SharingState.STALE
        return SharingState.LIVE
    }
}
