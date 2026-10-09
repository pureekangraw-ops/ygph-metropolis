package com.big.gobrowser.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.TextView
import android.widget.Toast
import com.big.gobrowser.BuildConfig

/**
 * Shown by both Observatory surfaces. All values are embedded in the APK at build time,
 * not supplied by Metropolis or guessed from whichever GitHub run is currently green.
 */
object ObservatoryBuildStamp {
    private val revision: String get() = BuildConfig.SOURCE_COMMIT
    private val runId: String get() = BuildConfig.BUILD_RUN_ID

    fun label(): String {
        val source = if (revision.matches(Regex("[0-9a-f]{40}"))) revision.take(10) else "LOCAL"
        val run = if (runId.matches(Regex("[0-9]+"))) " · Run $runId" else " · local build"
        return "Observatory v${BuildConfig.VERSION_NAME} · $source$run"
    }

    fun detail(): String = "YGG Observatory\nVersion: ${BuildConfig.VERSION_NAME}\nVersionCode: ${BuildConfig.VERSION_CODE}\nSource commit: $revision\nGitHub run: $runId"

    fun view(context: Context): TextView = ObservatoryTheme.status(context).apply {
        text = label()
        contentDescription = detail()
        setOnLongClickListener {
            val clipboard = context.getSystemService(ClipboardManager::class.java)
            clipboard?.setPrimaryClip(ClipData.newPlainText("Observatory build stamp", detail()))
            Toast.makeText(context, "คัดลอกเวอร์ชันและ Build ID แล้ว", Toast.LENGTH_SHORT).show()
            true
        }
    }
}
