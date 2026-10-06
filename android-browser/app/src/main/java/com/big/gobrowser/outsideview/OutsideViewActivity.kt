package com.big.gobrowser.outsideview

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class OutsideViewActivity : Activity() {
    private lateinit var store: MapStateStore
    private lateinit var renderer: MapLibreOutsideRenderer
    private lateinit var executor: MapCommandExecutor
    private lateinit var packageStore: LocalMapPackageStore
    private lateinit var status: TextView
    private var state = MapState()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = MapStateStore(this); packageStore = LocalMapPackageStore(this); state = store.load().state
        val root=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(16,16,16,16) }
        val heading=TextView(this).apply { text="Observatory Outside View  ·  TEST"; textSize=20f }
        status=TextView(this).apply { text="Local PMTiles only · live intake disabled"; setPadding(0,8,0,8) }
        val mapHost=FrameLayout(this)
        val controls=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL; gravity=Gravity.CENTER_VERTICAL }
        controls.addView(button("Import map") { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/octet-stream").addCategory(Intent.CATEGORY_OPENABLE), 40) })
        controls.addView(button("Clear pins") { apply(MapCommand("clear-${System.nanoTime()}",MapAction.CLEAR,scope="pins")) })
        controls.addView(button("Notes") { noteDialog() })
        controls.addView(button("Back") { finish() })
        root.addView(heading); root.addView(status); root.addView(controls); root.addView(mapHost,LinearLayout.LayoutParams(-1,0,1f)); setContentView(root)
        renderer=MapLibreOutsideRenderer(mapHost,packageStore); executor=MapCommandExecutor(store,renderer,ExecutionScope.TEST); executor.resume(); renderState()
    }
    private fun apply(command: MapCommand) { val receipt=executor.submit(command); state=store.load().state; status.text="${receipt.status} · revision ${state.revision}"; renderState() }
    private fun renderState() { renderer.render(RenderRequest("screen-${System.nanoTime()}",state.revision,renderer.styleGeneration,"screen",state)) {} }
    private fun noteDialog() { val input=EditText(this).apply { hint="Note for Outside View" }; android.app.AlertDialog.Builder(this).setTitle("Add note").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Save") { _,_ -> apply(MapCommand("note-${System.nanoTime()}",MapAction.NOTE,MapTarget("outside","map"),note=input.text.toString())) }.show() }
    private fun button(label:String, action:()->Unit)=Button(this).apply { text=label; setOnClickListener{action()}; minWidth=0 }
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:android.content.Intent?) { super.onActivityResult(requestCode,resultCode,data); if(requestCode==40 && resultCode==RESULT_OK && data?.data!=null) runCatching { LocalMapPackageStore(this).import(data.data!!); status.text="Map package imported · TEST" }.onFailure { Toast.makeText(this,"Import rejected: ${it.message}",Toast.LENGTH_LONG).show() } }
    override fun onPause() { renderer.cancel(); super.onPause() }
}
