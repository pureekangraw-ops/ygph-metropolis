package com.big.gobrowser.ui

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView

/** Reparents neither the live WebView nor the map when a window is resized. */
class AdaptiveWorkspace(context: Context) : LinearLayout(context) {
    val canvas = FrameLayout(context).apply { contentDescription = "พื้นที่เนื้อหาหลัก" }
    val commands = LinearLayout(context).apply { orientation = VERTICAL }
    private val panel = object : ScrollView(context) {
        var limit = Int.MAX_VALUE
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val available = View.MeasureSpec.getSize(heightMeasureSpec)
            val mode = View.MeasureSpec.getMode(heightMeasureSpec)
            val size = if (mode == View.MeasureSpec.UNSPECIFIED) limit else minOf(available, limit)
            super.onMeasure(widthMeasureSpec, View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.AT_MOST))
        }
    }.apply { isFillViewport = false; addView(commands) }
    var sidePanel = false
        private set

    init {
        addView(canvas)
        addView(panel)
    }

    private fun setLayout(view: View, width: Int, height: Int, weight: Float = 0f) {
        val current = view.layoutParams as? LayoutParams
        if (current == null || current.width != width || current.height != height || current.weight != weight)
            view.layoutParams = LayoutParams(width, height, weight)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val density = resources.displayMetrics.density
        val width = View.MeasureSpec.getSize(widthMeasureSpec)
        val height = View.MeasureSpec.getSize(heightMeasureSpec)
        val widthDp = width / density
        val heightDp = height / density
        sidePanel = widthDp >= 600 || (widthDp >= 480 && heightDp < 420) || (widthDp >= 300 && heightDp < 240)
        orientation = if (sidePanel) HORIZONTAL else VERTICAL
        if (sidePanel) {
            setLayout(canvas, 0, LayoutParams.MATCH_PARENT, 1f)
            setLayout(panel, ((if (widthDp >= 840) 280 else if (widthDp >= 480) 220 else 180) * density).toInt(), LayoutParams.MATCH_PARENT)
            panel.limit = height
        } else {
            setLayout(canvas, LayoutParams.MATCH_PARENT, 0, 1f)
            setLayout(panel, LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
            // Command overflow scrolls independently, so large fonts/IME cannot consume the canvas.
            panel.limit = maxOf(1, (height * .38f).toInt())
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }
}
