package com.big.gobrowser.outsideview

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.RectF
import android.view.ViewGroup
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.MapLibre
import org.maplibre.android.maps.*
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.sources.GeoJsonOptions
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.*
import org.maplibre.android.style.layers.PropertyFactory.*
import org.maplibre.android.module.http.HttpRequestUtil
import okhttp3.OkHttpClient
import okhttp3.Cache
import java.io.File

/** Actual MapLibre SDK surface. Confirmation waits for matching source revision and a fully rendered SDK frame. */
class MapLibreOutsideRenderer(private val host:ViewGroup,private val packageStore:LocalMapPackageStore?=null):MapRenderer {
    val mapView:MapView
    private var map:MapLibreMap?=null
    private var locationFix:Point?=null
    private var generation=0L
    private var resumed=false
    private var pending:Pair<RenderRequest,(RenderConfirmation)->Unit>?=null
    private val handler=Handler(Looper.getMainLooper())
    private var updatesComplete=false
    private var frameStarted=false
    private var cameraComplete=true
    private var cameraTarget:Point?=null
    private val timeout=Runnable {failPending("render-confirmation-timeout")}
    private val layerIds=arrayOf("zone-fill","grid-lines","pin-dots")
    var onReady:()->Unit={}
    var onConfirmed:(RenderConfirmation)->Unit={}
    var onSelect:(Point)->Unit={}
    var onError:(String)->Unit={}
    private val sourceIds=listOf("outside-zones","outside-grids","outside-pins")
    init {
        MapLibre.getInstance(host.context)
        val client=OkHttpClient.Builder().cache(Cache(File(host.context.cacheDir,"map-http"),64L*1024*1024))
            .addInterceptor {chain->chain.proceed(chain.request().newBuilder().header("User-Agent","YGG-Observatory/0.2 (+https://github.com/pureekangraw-ops/ygph-metropolis)").build())}.build()
        HttpRequestUtil.setOkHttpClient(client);HttpRequestUtil.setPrintRequestUrlOnFailure(false)
        mapView=MapView(host.context);host.addView(mapView,ViewGroup.LayoutParams(-1,-1));mapView.onCreate(null)
        mapView.addOnDidFailLoadingMapListener {_->onError("Map loading failed · retry from map tools");failPending("map-load-failed")}
        mapView.addOnWillStartRenderingFrameListener {if(updatesComplete&&cameraComplete)frameStarted=true}
        mapView.addOnDidFinishRenderingFrameListener(MapView.OnDidFinishRenderingFrameListener {fully,_,_->if(fully)confirmFrame()})
        mapView.getMapAsync {m->map=m;m.cameraPosition=CameraPosition.Builder().target(LatLng(13.75,100.5)).zoom(11.0).build();m.addOnMapLongClickListener {p->onSelect(Point(p.longitude,p.latitude));true};reloadStyle()}
    }
    override val foregroundReady:Boolean get()=resumed && map?.style?.isFullyLoaded==true
    override val styleGeneration:Long get()=generation
    fun reloadStyle(online:Boolean=true) {
        cancel()
        map?.setStyle(Style.Builder().fromJson(MapStyleFactory.style(packageStore?.active(),online))) {style->
            sourceIds.forEach {style.addSource(GeoJsonSource(it,"{\"type\":\"FeatureCollection\",\"features\":[]}",GeoJsonOptions().withSynchronousUpdate(true)))}
            style.addLayer(FillLayer("zone-fill",sourceIds[0]).withProperties(fillColor(color("#73b4d4")),fillOpacity(.25f)))
            style.addLayer(LineLayer("grid-lines",sourceIds[1]).withProperties(lineColor(color("#315f8e")),lineWidth(size(2,5,4))))
            style.addLayer(CircleLayer("pin-dots",sourceIds[2]).withProperties(circleColor(color("#cf476a")),circleRadius(size(7,12,10)),circleStrokeColor("#ffffff"),circleStrokeWidth(2f)))
            drawLocation()
            onReady()
        }
    }
    private fun color(normal:String)=Expression.switchCase(Expression.get("_highlighted"),Expression.literal("#f0b429"),Expression.get("_recommended"),Expression.literal("#20ad78"),Expression.literal(normal))
    private fun size(normal:Int,highlighted:Int,recommended:Int)=Expression.switchCase(Expression.get("_highlighted"),Expression.literal(highlighted),Expression.get("_recommended"),Expression.literal(recommended),Expression.literal(normal))
    override fun render(request:RenderRequest,callback:(RenderConfirmation)->Unit) {
        pending=request to callback;updatesComplete=false;frameStarted=false;cameraComplete=request.focus==null;cameraTarget=null
        handler.removeCallbacks(timeout);handler.postDelayed(timeout,25000)
        if(!foregroundReady){failPending("renderer-not-ready");return}
        val m=map?:run {failPending("map-unavailable");return};val style=m.style?:run {failPending("style-unavailable");return}
        val features=MapFeatureBuilder.build(request.state)
        val groups=listOf(features.zones,features.grids,features.pins)
        try {
            sourceIds.forEachIndexed {i,id->
                val array=JSONArray();groups[i].forEach {f->array.put(JSONObject().put("type","Feature").put("id",f.id).put("geometry",f.geometry).put("properties",JSONObject(f.properties.toString()).put("_revision",request.revision).put("_id",f.id).put("_highlighted",f.id in request.state.highlights).put("_recommended",f.id in request.state.recommendations)))}
                val source=style.getSourceAs<GeoJsonSource>(id)?:error("source-missing")
                // SDK synchronous source updates feed render-thread tiles before the next frame.
                source.setGeoJson(JSONObject().put("type","FeatureCollection").put("features",array).toString())
            }
            updatesComplete=true
            request.focus?.let {target->
                val point=mapTargetCenter(request.state,target)?:run {failPending("focus-target-unavailable");return}
                cameraTarget=point
                m.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(point.latitude,point.longitude),if(target.kind=="pin")16.0 else m.cameraPosition.zoom),object:MapLibreMap.CancelableCallback {
                    override fun onFinish(){if(pending?.first?.token==request.token){cameraComplete=true;frameStarted=false;mapView.invalidate()}}
                    override fun onCancel(){if(pending?.first?.token==request.token)failPending("focus-camera-cancelled")}
                })
            }
            mapView.invalidate()
        }catch(e:Exception){failPending("source-update-failed")}
    }
    private fun confirmFrame() {
        val (r,cb)=pending?:return
        if(!foregroundReady||r.styleGeneration!=generation||!updatesComplete||!frameStarted||!cameraComplete)return
        val m=map?:return
        cameraTarget?.let {wanted->val actual=m.cameraPosition.target?:return;if(kotlin.math.abs(actual.latitude-wanted.latitude)>.00001||kotlin.math.abs(actual.longitude-wanted.longitude)>.00001)return}
        val features=m.queryRenderedFeatures(RectF(0f,0f,mapView.width.toFloat(),mapView.height.toFloat()),*layerIds)
        if(features.any {!it.hasProperty("_revision")||it.getNumberProperty("_revision").toLong()!=r.revision})return
        // Only features in this rendered viewport are evidence. Offscreen source entries
        // are ingested by the synchronous update; their visibility is never claimed.
        val ids=features.mapNotNull {if(it.hasProperty("_id"))it.getStringProperty("_id") else null}.toSet()
        pending=null;handler.removeCallbacks(timeout)
        val c=confirmation(r,ids);cb(c);onConfirmed(c)
    }
    private fun failPending(error:String){
        val (r,cb)=pending?:return;pending=null;handler.removeCallbacks(timeout)
        val c=confirmation(r,emptySet(),error);cb(c);onConfirmed(c);onError("$error · ลองแสดงแผนที่ใหม่ได้")
    }
    private fun confirmation(r:RenderRequest,ids:Set<String>,error:String?=null):RenderConfirmation {
        val actual=map?.cameraPosition?.target
        val camera=actual?.let {Bounds(it.longitude,it.latitude,it.longitude,it.latitude)}
        return RenderConfirmation(r.commandId,r.revision,r.styleGeneration,r.token,ids,r.state.focused,camera,error,map?.cameraPosition?.zoom)
    }
    fun showLocation(point:Point?){locationFix=point;drawLocation()}
    private fun drawLocation(){
        val style=map?.style?:return
        if(!style.isFullyLoaded)return
        val json=locationFix?.let {"{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[${it.longitude},${it.latitude}]},\"properties\":{}}]}"}?:"{\"type\":\"FeatureCollection\",\"features\":[]}"
        val source=style.getSourceAs<GeoJsonSource>("device-location")
        if(source==null){
            style.addSource(GeoJsonSource("device-location",json,GeoJsonOptions().withSynchronousUpdate(true)))
            style.addLayer(CircleLayer("device-location-dot","device-location").withProperties(circleColor("#78bfff"),circleRadius(8f),circleStrokeColor("#101516"),circleStrokeWidth(3f)))
        }else source.setGeoJson(json)
    }
    fun centerOnLocation(point:Point):Boolean {
        if(!foregroundReady || pending!=null)return false
        map?.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(point.latitude,point.longitude),15.0))?:return false
        return true
    }
    fun center():Point?=map?.cameraPosition?.target?.let {Point(it.longitude,it.latitude)}
    override fun cancel(){generation++;pending=null;handler.removeCallbacks(timeout);updatesComplete=false;frameStarted=false;map?.cancelTransitions()}
    fun onStart()=mapView.onStart()
    fun onResume(){resumed=true;mapView.onResume();if(map?.style?.isFullyLoaded==true)onReady()}
    fun onPause(){resumed=false;cancel();mapView.onPause()}
    fun onStop()=mapView.onStop()
    fun onDestroy(){cancel();mapView.onDestroy()}
    fun onLowMemory()=mapView.onLowMemory()
    fun onSaveInstanceState(bundle:Bundle)=mapView.onSaveInstanceState(bundle)
}
