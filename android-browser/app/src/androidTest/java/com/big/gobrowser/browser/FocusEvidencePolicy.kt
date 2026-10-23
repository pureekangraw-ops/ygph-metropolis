package com.big.gobrowser.browser

/** Strict text allowlist: never retain dump lines, intents, titles, URLs or input values. */
internal object FocusEvidencePolicy {
    const val MAX_INPUT=262144
    const val MAX_OUTPUT=16384
    private val field=Regex("(?:mCurrentFocus|mFocusedApp|mFocusedWindow|mObscuringWindow|mTopFocusedDisplayId|mTopFullscreenOpaqueWindowState|mImeInputTarget|mImeLayeringTarget|mResumedActivity|topResumedActivity|ResumedActivity|mFocusedRootTask|mKeyguardShowing|mKeyguardShown|mDreaming|mWakefulness|mIsPowered|mInteractive|mScreenOffTimeoutSetting|FocusedApplications|FocusedWindows|Display Power|Window #|displayId=)")
    private val component=Regex("\\b[a-z][a-z0-9_]*(?:\\.[A-Za-z0-9_$]+)+/[.A-Za-z0-9_$]+")
    private val windowId=Regex("(?:Window|ActivityRecord)\\{([0-9a-f]+)\\b")
    private val state=Regex("\\b(?:true|false|null|Awake|Asleep|Dozing|Dreaming|ON|OFF|DOZE)\\b")
    fun sanitize(raw:String):String = buildString {
        for(line in raw.take(MAX_INPUT).lineSequence()) {
            val key=field.find(line)?.value?:continue
            val identities=component.findAll(line.substringBefore("Intent {").replace(Regex("https?://[^ ]+"),"[url]")).map {it.value}.filter {it.startsWith("com.android.") || it.startsWith("com.google.android.") || it.startsWith("com.big.gobrowser/")}.map {it.take(180)}.take(4).toList()
            val ids=windowId.findAll(line).map {it.groupValues[1]}.take(4).toList()
            val states=state.findAll(line).map {it.value}.take(4).toList()
            append(key);append(" components=");append(identities);append(" ids=");append(ids);append(" states=");append(states);append('\n')
            if(length>=MAX_OUTPUT)break
        }
    }.take(MAX_OUTPUT)
    fun preserveFailure(error:Throwable,capture:()->Unit):Nothing {
        try {capture()} catch(_:Throwable) { /* Diagnostic failure must not replace the test failure. */ }
        throw error
    }
}
