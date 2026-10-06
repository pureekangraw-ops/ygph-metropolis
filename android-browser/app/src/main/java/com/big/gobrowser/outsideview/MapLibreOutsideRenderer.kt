package com.big.gobrowser.outsideview

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import android.view.ViewGroup

class MapLibreOutsideRenderer(private val host: ViewGroup) : MapRenderer {
    private val view = OutsideMapSurface(host.context)
    private var generation = 0L
    private var ready = false
    init { host.addView(view, ViewGroup.LayoutParams(-1,-1)); ready=true }
    override val foregroundReady: Boolean get() = ready && view.visibility == View.VISIBLE
    override val styleGeneration: Long get() = generation
    override fun render(request: RenderRequest, callback: (RenderConfirmation) -> Unit) {
        view.features = MapFeatureBuilder.build(request.state); view.invalidate()
        view.post { callback(RenderConfirmation(request.commandId,request.revision,request.styleGeneration,request.token,(view.features?.zones.orEmpty()+view.features?.grids.orEmpty()+view.features?.pins.orEmpty()).map { it.id }.toSet(),request.state.focused?.let { "focus" },null)) }
    }
    override fun cancel() { generation += 1; view.features=null }
    private class OutsideMapSurface(context: android.content.Context) : View(context) {
        var features: MapFeatures? = null
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas: Canvas) { super.onDraw(canvas); canvas.drawColor(Color.rgb(245,247,250)); val fs=features ?: return; paint.style=Paint.Style.STROKE; paint.color=Color.rgb(40,80,120); fs.grids.forEach { canvas.drawRect(24f+fs.grids.indexOf(it)*18f,80f,180f+fs.grids.indexOf(it)*18f,180f,paint) }; paint.style=Paint.Style.FILL; paint.color=Color.DKGRAY; canvas.drawText("Outside View · TEST / local map",24f,36f,paint); fs.pins.forEachIndexed { i,_ -> paint.color=Color.RED; canvas.drawCircle(80f+i*52f,220f,8f,paint) } }
    }
}
