package com.big.gobrowser.outsideview

/** Owner-started only; Android may still reject launch after the UI leaves the foreground. */
object LocationSessionPolicy {
    fun mayStart(ownerStart:Boolean,visible:Boolean,locationGranted:Boolean,notificationsGranted:Boolean,locationEnabled:Boolean)=
        ownerStart && visible && locationGranted && notificationsGranted && locationEnabled
}
