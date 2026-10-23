package com.big.gobrowser.browser

import android.view.View
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.matcher.ViewMatchers.isRoot
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import com.big.gobrowser.outsideview.OutsideViewActivity
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import java.io.File

/** Deliberate caught probe verifies collection before Activity cleanup; never marks a real failure passed. */
class FocusFailureDiagnosticsTest {
    private val activity=ActivityTestRule(OutsideViewActivity::class.java)
    @get:Rule val rules:RuleChain=RuleChain.outerRule(FocusFailureDiagnostics()).around(activity)
    @Test fun syntheticEspressoFailureRetainsEvidenceBeforeCleanupAndStillThrows() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("focusDiagnostics")=="true")
        val root=File(activity.activity.getExternalFilesDir(null),"focus-evidence")
        val before=root.listFiles()?.map {it.name}?.toSet().orEmpty()
        var thrown:Throwable?=null
        try {
            onView(isRoot()).perform(object:ViewAction {
                override fun getConstraints()=isRoot()
                override fun getDescription()="Synthetic focus diagnostics probe"
                override fun perform(controller:UiController,view:View) {throw FocusEvidenceProbe()}
            })
        } catch(error:Throwable) {thrown=error}
        assertNotNull("Original Espresso error must escape the hook",thrown)
        assertTrue("Only the intentional probe is caught",generateSequence(thrown){it.cause}.any {it is FocusEvidenceProbe})
        assertFalse("Collection must precede Activity cleanup",activity.activity.isFinishing)
        val evidence=root.listFiles().orEmpty().filter {it.name !in before && it.extension=="txt"}.single()
        val text=evidence.readText()
        assertTrue(text.contains("phase=espresso-failure-before-cleanup"))
        for(service in listOf("window windows","input","activity activities","power"))assertTrue(text.contains("service=$service"))
        assertTrue(text.length<=70000)
    }
}
