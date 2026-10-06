package com.big.gobrowser.outsideview

interface MapRenderer {
    val foregroundReady: Boolean
    val styleGeneration: Long
    fun render(request: RenderRequest, callback: (RenderConfirmation) -> Unit)
    fun cancel()
}
