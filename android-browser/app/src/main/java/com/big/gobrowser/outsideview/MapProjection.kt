package com.big.gobrowser.outsideview

data class ScreenPoint(val x:Float,val y:Float)
object MapProjection {
    fun project(point:Point,bounds:Bounds,width:Int,height:Int):ScreenPoint{
        val x=((point.longitude-bounds.west)/(bounds.east-bounds.west).coerceAtLeast(0.000001))*width
        val y=height-((point.latitude-bounds.south)/(bounds.north-bounds.south).coerceAtLeast(0.000001))*height
        return ScreenPoint(x.toFloat(),y.toFloat())
    }
    fun fit(state:MapState):Bounds?{
        val bounds=state.grids.values.map{it.bounds}.toMutableList()
        state.pins.values.forEach{bounds.add(Bounds(it.point.longitude,it.point.latitude,it.point.longitude,it.point.latitude))}
        if(bounds.isEmpty())return null
        return Bounds(bounds.minOf{it.west},bounds.minOf{it.south},bounds.maxOf{it.east},bounds.maxOf{it.north})
    }
}
