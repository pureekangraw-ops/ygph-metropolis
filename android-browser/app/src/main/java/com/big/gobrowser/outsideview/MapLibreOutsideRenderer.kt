package com.big.gobrowser.outsideview

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import android.view.ViewGroup
import org.json.JSONArray

class MapLibreOutsideRenderer(private val host:ViewGroup,private val packageStore:LocalMapPackageStore?=null):MapRenderer{
    private val view=OutsideMapSurface(host.context);private var generation=0L;private var ready=false
    init{host.addView(view,ViewGroup.LayoutParams(-1,-1));ready=true}
    override val foregroundReady:Boolean get()=ready&&view.isShown
    override val styleGeneration:Long get()=generation
    override fun render(request:RenderRequest,callback:(RenderConfirmation)->Unit){val pkg=packageStore?.active();if(packageStore!=null&&pkg==null){callback(RenderConfirmation(request.commandId,request.revision,request.styleGeneration,request.token,emptySet(),error="no-active-local-pmtiles"));return};view.features=MapFeatureBuilder.build(request.state);view.attribution=pkg?.attribution;view.invalidate();view.postOnAnimation{if(view.isShown)callback(RenderConfirmation(request.commandId,request.revision,request.styleGeneration,request.token,view.featureIds(),view.features?.focusedId,pkg?.bounds))else callback(RenderConfirmation(request.commandId,request.revision,request.styleGeneration,request.token,emptySet(),error="frame-not-visible"))}}
    override fun cancel(){generation++;view.features=null}
    private class OutsideMapSurface(context:android.content.Context):View(context){var features:MapFeatures?=null;var attribution:String?=null;private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas:Canvas){canvas.drawColor(Color.rgb(245,247,250));val f=features?:return;val points=mutableListOf<Pair<Double,Double>>();f.grids.forEach{collectPolygon(it.geometry,points)};f.pins.forEach{val a=it.geometry.optJSONArray("coordinates");if(a!=null)points+=a.getDouble(0) to a.getDouble(1)};if(points.isEmpty()){paint.color=Color.DKGRAY;canvas.drawText("Outside View · no geometry",24f,36f,paint);return};val minX=points.minOf{it.first};val maxX=points.maxOf{it.first};val minY=points.minOf{it.second};val maxY=points.maxOf{it.second};fun x(v:Double)=(24f+((v-minX)/(maxX-minX).coerceAtLeast(0.000001))*width.coerceAtLeast(1)*0.85f).toFloat();fun y(v:Double)=(height-48f-((v-minY)/(maxY-minY).coerceAtLeast(0.000001))*height.coerceAtLeast(1)*0.65f).toFloat();paint.style=Paint.Style.STROKE;paint.color=Color.rgb(40,80,120);f.grids.forEach{val ring=it.geometry.getJSONArray("coordinates").getJSONArray(0);for(i in 0 until ring.length()-1){val a=ring.getJSONArray(i);val b=ring.getJSONArray(i+1);canvas.drawLine(x(a.getDouble(0)),y(a.getDouble(1)),x(b.getDouble(0)),y(b.getDouble(1)),paint)}};paint.style=Paint.Style.FILL;f.pins.forEach{val a=it.geometry.getJSONArray("coordinates");paint.color=if(it.id in f.highlightedIds)Color.MAGENTA else Color.RED;canvas.drawCircle(x(a.getDouble(0)),y(a.getDouble(1)),8f,paint)};paint.color=Color.DKGRAY;canvas.drawText("Outside View · local PMTiles",24f,28f,paint);if(attribution!=null)canvas.drawText(attribution!!,24f,height-16f,paint)}
        private fun collectPolygon(g:org.json.JSONObject,out:MutableList<Pair<Double,Double>>){val ring=g.optJSONArray("coordinates")?.optJSONArray(0)?:return;for(i in 0 until ring.length()){val a=ring.getJSONArray(i);out+=a.getDouble(0) to a.getDouble(1)}}
        fun featureIds():Set<String> = (features?.zones.orEmpty()+features?.grids.orEmpty()+features?.pins.orEmpty()).map{it.id}.toSet()
    }
}
