package com.big.gobrowser.browser

import android.graphics.Bitmap
import android.os.Build
import android.util.Log
import androidx.test.espresso.Espresso
import androidx.test.espresso.base.DefaultFailureHandler
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream

/** Opt-in synthetic emulator evidence. Espresso invokes this before Rule/Activity cleanup. */
class FocusFailureDiagnostics:TestRule {
    override fun apply(base:Statement,description:Description)=object:Statement() {
        override fun evaluate() {
            val instrumentation=InstrumentationRegistry.getInstrumentation()
            val defaults=DefaultFailureHandler(instrumentation.targetContext)
            val enabled=InstrumentationRegistry.getArguments().getString("focusDiagnostics")=="true" &&
                Build.HARDWARE in setOf("ranchu","goldfish")
            if(enabled)Espresso.setFailureHandler {error,_->
                FocusEvidencePolicy.preserveFailure(error){budget.claim(error)?.let {capture(description,it)}}
            }
            try {base.evaluate()} finally {if(enabled)Espresso.setFailureHandler(defaults)}
        }
    }
    private fun capture(description:Description,index:Int) {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val automation=instrumentation.uiAutomation
        val prefix="focus-${android.os.Process.myPid()}-$index"
        val root=File(instrumentation.targetContext.getExternalFilesDir(null),"focus-evidence").apply {mkdirs()}
        val text=StringBuilder("test=${description.className}.${description.methodName}\nphase=espresso-failure-before-cleanup\n")
        // Screenshot first, before shell diagnostics can change timing. CI emulator contains only synthetic fixtures.
        runCatching {
            val original=automation.takeScreenshot()?:error("screenshot unavailable")
            val scale=minOf(1.0,720.0/original.width,1600.0/original.height)
            val resized=Bitmap.createScaledBitmap(original,(original.width*scale).toInt(),(original.height*scale).toInt(),true)
            val bytes=ByteArrayOutputStream().also {resized.compress(Bitmap.CompressFormat.PNG,100,it)}.toByteArray()
            if(resized!==original)resized.recycle();original.recycle()
            if(bytes.size<=524288)File(root,"$prefix.png").writeBytes(bytes) else text.append("screenshot=omitted-size-limit\n")
        }.onFailure {text.append("screenshot=unavailable\n")}
        for(service in listOf("window windows","input","activity activities","power")) {
            val safe=runCatching {
                automation.executeShellCommand("dumpsys -t 2 $service").use {fd->
                    FileInputStream(fd.fileDescriptor).use {stream->
                        val bytes=ByteArray(FocusEvidencePolicy.MAX_INPUT)
                        var total=0
                        while(total<bytes.size){val n=stream.read(bytes,total,bytes.size-total);if(n<0)break;total+=n}
                        FocusEvidencePolicy.sanitize(String(bytes,0,total,Charsets.UTF_8))
                    }
                }
            }.getOrElse {"unavailable\n"}
            text.append("service=$service\n").append(safe)
        }
        val output=text.toString().take(70000)
        File(root,"$prefix.txt").writeText(output)
        output.lineSequence().forEach {Log.i("FocusFailureEvidence",it)}
        // Gradle uninstalls test packages; retain bounded synthetic evidence outside their directories.
        for(extension in listOf("png","txt")) {
            val source=File(root,"$prefix.$extension")
            if(source.isFile)runCatching {automation.executeShellCommand("cp ${source.absolutePath} /data/local/tmp/$prefix.$extension").use {fd->FileInputStream(fd.fileDescriptor).use {it.readBytes()}}}
        }
    }
    companion object {private val budget=FocusEvidencePolicy.CaptureBudget()}
}
