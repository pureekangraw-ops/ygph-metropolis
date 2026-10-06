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
        surface.features=MapFeatureBuilder.build(request.state)
        surface.state=request.state
        surface.invalidate()
        surface.post{callback(RenderConfirmation(request.commandId,request.revision,request.styleGeneration,request.token,surface.ids(),request.state.focused,pkg?.bounds))}
    }
    override fun cancel(){generation+=1;surface.features=null}
    private class OutsideMapSurface(context:android.content.Context):View(context){
        var features:MapFeatures?=null
        var state:MapState?=null
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas:Canvas){canvas.drawColor(Color.rgb(245,247,250));paint.color=Color.DKGRAY;canvas.drawText("Outside View · coordinate-backed local map",24f,32f,paint);val current=features?:return;val source=state?:return;val bounds=MapProjection.fit(source)?:return;paint.style=Paint.Style.STROKE;paint.color=Color.rgb(40,80,120);for(grid in source.grids.values){val a=MapProjection.project(Point(grid.bounds.west,grid.bounds.north),bounds,width,height);val b=MapProjection.project(Point(grid.bounds.east,grid.bounds.south),bounds,width,height);canvas.drawRect(a.x,a.y,b.x,b.y,paint)};paint.style=Paint.Style.FILL;for(pin in source.pins.values){val p=MapProjection.project(pin.point,bounds,width,height);paint.color=if(source.highlights.contains(pin.id))Color.MAGENTA else Color.RED;canvas.drawCircle(p.x,p.y,8f,paint)}}
        fun ids():Set<String>{val result=mutableSetOf<String>();val current=features?:return result;for(item in current.zones)result.add(item.id);for(item in current.grids)result.add(item.id);for(item in current.pins)result.add(item.id);return result}
    }
}
