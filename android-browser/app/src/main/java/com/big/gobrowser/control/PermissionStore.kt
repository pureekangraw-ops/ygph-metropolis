package com.big.gobrowser.control

class PermissionStore(private val initialEpoch:Long=0L,private val deviceScope:Boolean=false) {
    private val epochs=mutableMapOf<String,Long>()
    private var deviceEpoch=initialEpoch
    fun epoch(tabId:String):Long=if(deviceScope)deviceEpoch else epochs[tabId]?:initialEpoch
    fun revoke(tabId:String):Long {
        val next=epoch(tabId)+1
        if(deviceScope)deviceEpoch=next else epochs[tabId]=next
        return next
    }
}
