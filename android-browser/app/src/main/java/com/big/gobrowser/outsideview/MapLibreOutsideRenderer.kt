package com.big.gobrowser.outsideview

import android.os.Bundle
import android.view.ViewGroup
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.MapLibre
import org.maplibre.android.maps.*
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.style.sources.GeoJsonSource
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
    private var generation=0L
    private var resumed=false
    private var pending:Pair<RenderRequest,(RenderConfirmation)->Unit>?=null
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
        mapView.addOnDidFailLoadingMapListener {error->onError("Map loading failed");pending?.let {(r,cb)->pending=null;cb(confirmation(r,emptySet(),"map-load-failed"))}}
        mapView.addOnDidFinishRenderingFrameListener(MapView.OnDidFinishRenderingFrameListener {fully,_,_->if(fully)confirmFrame()})
        mapView.getMapAsync {m->map=m;m.cameraPosition=CameraPosition.Builder().target(LatLng(13.75,100.5)).zoom(11.0).build();m.addOnMapLongClickListener {p->onSelect(Point(p.longitude,p.latitude));true};reloadStyle()}
    }
    override val foregroundReady:Boolean get()=resumed && map?.style?.isFullyLoaded==true
    override val styleGeneration:Long get()=generation
    fun reloadStyle(online:Boolean=true) {
        cancel()
        map?.setStyle(Style.Builder().fromJson(MapStyleFactory.style(packageStore?.active(),online))) {style->
            sourceIds.forEach {style.addSource(GeoJsonSource(it,"{\"type\":\"FeatureCollection\",\"features\":[]}"))}
            style.addLayer(FillLayer("zone-fill",sourceIds[0]).withProperties(fillColor("#73b4d4"),fillOpacity(.18f)))
            style.addLayer(LineLayer("grid-lines",sourceIds[1]).withProperties(lineColor("#315f8e"),lineWidth(2f)))
            style.addLayer(CircleLayer("pin-dots",sourceIds[2]).withProperties(circleColor("#cf476a"),circleRadius(7f),circleStrokeColor("#ffffff"),circleStrokeWidth(2f)))
            onReady()
        }
    }
    override fun render(request:RenderRequest,callback:(RenderConfirmation)->Unit) {
        if(!foregroundReady){callback(confirmation(request,emptySet(),"renderer-not-ready"));return}
        val style=map?.style?:return
        val features=MapFeatureBuilder.build(request.state)
        val groups=listOf(features.zones,features.grids,features.pins)
        // Invalidate the old readback before asynchronous source updates begin.
        pending=request to callback
        sourceIds.forEachIndexed {i,id->
            val array=JSONArray();groups[i].forEach {f->array.put(JSONObject().put("type","Feature").put("id",f.id).put("geometry",f.geometry).put("properties",JSONObject(f.properties.toString()).put("_revision",request.revision).put("_id",f.id)))}
            style.getSourceAs<GeoJsonSource>(id)?.setGeoJson(JSONObject().put("type","FeatureCollection").put("features",array).toString())
        }
        request.state.focused?.let {id->request.state.pins[id]?.let {pin->map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(pin.point.latitude,pin.point.longitude),16.0))}}
        mapView.invalidate()
    }
    private fun confirmFrame() {
        val (r,cb)=pending?:return
        if(!foregroundReady||r.styleGeneration!=generation)return
        val style=map?.style?:return
        val expected=listOf(r.state.zones.filterValues {it.geometryKnown}.keys,r.state.grids.keys,r.state.pins.keys)
        val ids=mutableSetOf<String>()
        for((index,id) in sourceIds.withIndex()) {
            val features=style.getSourceAs<GeoJsonSource>(id)?.querySourceFeatures(null)?:return
            val found=features.mapNotNull {it.getStringProperty("_id")}.toSet()
            if(found!=expected[index] || features.any {!it.hasProperty("_revision")||it.getNumberProperty("_revision").toLong()!=r.revision})return
            ids.addAll(found)
        }
        pending=null
        val c=confirmation(r,ids);cb(c);onConfirmed(c)
    }
    private fun confirmation(r:RenderRequest,ids:Set<String>,error:String?=null)=RenderConfirmation(r.commandId,r.revision,r.styleGeneration,r.token,ids,r.state.focused,error=error)
    fun center():Point?=map?.cameraPosition?.target?.let {Point(it.longitude,it.latitude)}
    override fun cancel(){generation++;pending=null}
    fun onStart()=mapView.onStart()
    fun onResume(){resumed=true;mapView.onResume();if(map?.style?.isFullyLoaded==true)onReady()}
    fun onPause(){resumed=false;cancel();mapView.onPause()}
    fun onStop()=mapView.onStop()
    fun onDestroy(){cancel();mapView.onDestroy()}
    fun onLowMemory()=mapView.onLowMemory()
    fun onSaveInstanceState(bundle:Bundle)=mapView.onSaveInstanceState(bundle)
}
