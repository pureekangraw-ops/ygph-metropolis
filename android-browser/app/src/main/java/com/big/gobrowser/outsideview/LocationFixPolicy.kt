package com.big.gobrowser.outsideview

object LocationFixPolicy {
    fun accepts(longitude:Double,latitude:Double,accuracy:Float,ageMs:Long)=
        longitude.isFinite() && longitude in -180.0..180.0 && latitude.isFinite() && latitude in -90.0..90.0 &&
        accuracy.isFinite() && accuracy>=0 && ageMs in 0..30_000
}
