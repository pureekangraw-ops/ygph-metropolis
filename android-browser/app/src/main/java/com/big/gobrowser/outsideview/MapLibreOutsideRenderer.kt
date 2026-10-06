package com.big.gobrowser.outsideview

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import android.view.ViewGroup

class MapLibreOutsideRenderer(private val host:ViewGroup,private val packageStore:LocalMapPackageStore?=null):MapRenderer{
    private val surface=OutsideMapSurface(host.context)
    private var generation=0L
    init{host.addView(surface,ViewGroup.LayoutParams(-1,-1))}
    override val foregroundReady:Boolean get()=surface.visibility==View.VISIBLE
    override val styleGeneration:Long get()=generation
    override fun render(request:RenderRequest,callback:(RenderConfirmation)->Unit){
        val pkg=packageStore?.active()
        if(packageStore!=null&&pkg==null){callback(RenderConfirmation(request.commandId,request.revision,request.styleGeneration,request.token,emptySet(),error="no-active-local-pmtiles"));return}
        surface.features=MapFeatureBuilder.build(request.state);surface.attribution=pkg?.attribution;surface.invalidate()
        surface.post{if(surface.isShown)callback(RenderConfirmation(request.commandId,request.revision,request.styleGeneration,request.token,surface.featureIds(),request.state.focused,pkg?.bounds))else callback(RenderConfirmation(request.commandId,request.revision,request.styleGeneration,request.token,emptySet(),error="frame-not-visible"))}
    }
    override fun cancel(){generation+=1;surface.features=null}
    private class OutsideMapSurface(context:android.content.Context):View(context){
        var features:MapFeatures?=null
        var attribution:String?=null
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas:Canvas){
            canvas.drawColor(Color.rgb(245,247,250));val current=features?:return;val coords=ArrayList<Pair<Double,Double>>()
            for(grid in current.grids){val ring=grid.geometry.optJSONArray("coordinates")?.optJSONArray(0)?:continue;for(i in 0 until ring.length()){val item=ring.getJSONArray(i);coords.add(Pair(item.getDouble(0),item.getDouble(1)))}}
            for(pin in current.pins){val point=pin.geometry.optJSONArray("coordinates")?:continue;coords.add(Pair(point.getDouble(0),point.getDouble(1)))}
            if(coords.isEmpty()){paint.color=Color.DKGRAY;canvas.drawText("Outside View · no geometry",24f,36f,paint);return}
            var minX=coords[0].first;var maxX=minX;var minY=coords[0].second;var maxY=minY
            for(coord in coords){if(coord.first<minX)minX=coord.first;if(coord.first>maxX)maxX=coord.first;if(coord.second<minY)minY=coord.second;if(coord.second>maxY)maxY=coord.second}
            val dx=(maxX-minX).coerceAtLeast(0.000001);val dy=(maxY-minY).coerceAtLeast(0.000001)
            fun screenX(value:Double):Float=(24f+((value-minX)/dx)*width*0.85f).toFloat()
            fun screenY(value:Double):Float=(height-48f-((value-minY)/dy)*height*0.65f)
            paint.style=Paint.Style.STROKE;paint.color=Color.rgb(40,80,120)
            for(grid in current.grids){val ring=grid.geometry.optJSONArray("coordinates")?.optJSONArray(0)?:continue;for(i in 0 until ring.length()-1){val a=ring.getJSONArray(i);val b=ring.getJSONArray(i+1);canvas.drawLine(screenX(a.getDouble(0)),screenY(a.getDouble(1)),screenX(b.getDouble(0)),screenY(b.getDouble(1)),paint)}}
            paint.style=Paint.Style.FILL
            for(pin in current.pins){val point=pin.geometry.optJSONArray("coordinates")?:continue;paint.color=if(current.highlightedIds.contains(pin.id))Color.MAGENTA else Color.RED;canvas.drawCircle(screenX(point.getDouble(0)),screenY(point.getDouble(1)),8f,paint)}
            paint.color=Color.DKGRAY;canvas.drawText("Outside View · local PMTiles",24f,28f,paint);val label=attribution;if(label!=null)canvas.drawText(label,24f,height-16f,paint)
        }
        fun featureIds():Set<String>{val result=mutableSetOf<String>();val current=features?:return result;for(item in current.zones)result.add(item.id);for(item in current.grids)result.add(item.id);for(item in current.pins)result.add(item.id);return result}
    }
}
