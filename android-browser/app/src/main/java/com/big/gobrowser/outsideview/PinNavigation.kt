package com.big.gobrowser.outsideview

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

enum class NavigationResult { HANDOFF_STARTED, REJECTED }
object PinNavigation {
    fun launch(context: Context, pin: Pin): NavigationResult {
        if (!pin.evidence.coordinate.equals(EvidenceStatus.VERIFIED) || !pin.point.longitude.isFinite() || !pin.point.latitude.isFinite()) return NavigationResult.REJECTED
        return try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${pin.point.latitude},${pin.point.longitude}?q=${pin.point.latitude},${pin.point.longitude}"))); NavigationResult.HANDOFF_STARTED } catch (_: ActivityNotFoundException) { NavigationResult.REJECTED }
    }
}
