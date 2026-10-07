package com.big.gobrowser.ui

enum class SharingState(val label:String) {
    STOPPED("หยุดแชร์"), UNPAIRED("ยังไม่เชื่อมเมโทร"), WAITING("รอเมโทรรับข้อมูล"),
    LIVE("LIVE · เมโทรรับข้อมูลล่าสุดแล้ว"), BACKGROUND("BACKGROUND · หยุดแชร์เมื่อออกจากหน้าจอ"),
    STALE("STALE · ข้อมูลยังไม่สด"), OFFLINE("OFFLINE · ไม่มีอินเทอร์เน็ต")
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
