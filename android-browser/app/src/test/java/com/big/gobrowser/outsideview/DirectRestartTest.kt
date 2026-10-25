package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.TimeUnit

/** Separate JVMs retain only synthetic file bytes, not coordinator/static state. */
class DirectRestartTest {
    @Test fun failedWritesAfter401SurviveActualProcessExit() = restart("401")
    @Test fun savedCredentialValidation401SurvivesActualProcessExit() = restart("validate401")
    @Test fun processDeathDuringRequestRetainsReconnectGuard() = restart("halt")

    private fun restart(mode:String) {
        val root=java.nio.file.Files.createTempDirectory("direct-restart").toFile()
        try {
            File(root,"guard").writeText("false")
            File(root,"map").writeText("synthetic unrelated saved map")
            val classpath=listOf(DirectRestartProbe::class.java,DirectConnection::class.java,kotlin.Unit::class.java)
                .map {File(it.protectionDomain.codeSource.location.toURI()).path}.distinct().joinToString(File.pathSeparator)
            fun run(phase:String) {
                val child=ProcessBuilder(File(System.getProperty("java.home"),"bin/java").path,
                    "-cp",classpath,DirectRestartProbe::class.java.name,root.path,phase)
                    .redirectErrorStream(true).redirectOutput(File(root,"$phase.log")).start()
                try {
                    assertTrue("Child timeout",child.waitFor(10,TimeUnit.SECONDS))
                    assertEquals(File(root,"$phase.log").readText(),0,child.exitValue())
                } finally { if(child.isAlive)child.destroyForcibly() }
            }
            run(mode)
            run("restart")
            assertEquals("1",File(root,"calls").readText())
            assertEquals("synthetic unrelated saved map",File(root,"map").readText())
        } finally {root.deleteRecursively()}
    }
}

object DirectRestartProbe {
    @JvmStatic fun main(args:Array<String>) {
        val root=File(args[0]);val mode=args[1];var failWrites=false
        val guard=File(root,"guard")
        val connection=DirectConnection(load={"synthetic-persisted-credential"},save={},revoke={},
            suspended={guard.readText().toBooleanStrict()},suspendPolling={value ->
                check(!failWrites)
                java.io.FileOutputStream(guard).use {it.write(value.toString().toByteArray());it.fd.sync()}
            },readPending={ _:String ->
                check(mode!="restart") {"Rejected credential dispatched after process restart"}
                File(root,"calls").writeText("1")
                if(mode=="halt")Runtime.getRuntime().halt(0)
                failWrites=true
                throw DirectHttpFailure(401)
            })
        if(mode=="restart") {
            check(connection.blocked());check(!connection.canPoll())
            check(runCatching {connection.pending()}.exceptionOrNull() is IllegalStateException)
        } else {
            check(runCatching {
                if(mode=="validate401")connection.validate(connection.beginValidation(),"synthetic-persisted-credential")
                else connection.pending()
            }.exceptionOrNull() is DirectHttpFailure)
        }
    }
}
