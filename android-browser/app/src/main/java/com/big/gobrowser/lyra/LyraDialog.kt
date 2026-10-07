package com.big.gobrowser.lyra

import android.app.Activity
import android.app.AlertDialog
import android.net.Uri
import android.webkit.*
import android.widget.*
import android.text.InputType
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

/** The bridge exists ONLY in this trusted asset view, never in the browsing WebViews. */
object LyraDialog {
    fun show(activity:Activity,mode:String,contextProvider:()->JSONObject) {
        val model=ModelConnection(activity)
        val column=LinearLayout(activity).apply {orientation=LinearLayout.VERTICAL}
        val web=WebView(activity)
        var alive=true
        val worker=Executors.newSingleThreadExecutor()
        web.settings.javaScriptEnabled=true;web.settings.allowFileAccess=false;web.settings.allowContentAccess=false
        web.settings.domStorageEnabled=false;web.settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
        web.webViewClient=object:WebViewClient(){
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=true
            override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse {
                val u=request.url;val name=u.path.orEmpty().removePrefix("/lyra/")
                val allowed=setOf("index.html","ui.css","ui.mjs","app-agent.mjs","policy.mjs","prompts.mjs","runtime.mjs")
                if(u.scheme!="https"||u.host!="appassets.androidplatform.net"||u.path!="/lyra/$name"||name !in allowed)
                    return WebResourceResponse("text/plain","UTF-8",403,"Forbidden",emptyMap(),ByteArrayInputStream(ByteArray(0)))
                val mime=when {name.endsWith(".mjs")->"text/javascript";name.endsWith(".css")->"text/css";else->"text/html"}
                return WebResourceResponse(mime,"UTF-8",activity.assets.open("lyra/$name"))
            }
        }
        web.addJavascriptInterface(object {
            @JavascriptInterface fun info()=JSONObject().put("mode",mode).put("configured",model.configured()).toString()
            @JavascriptInterface fun context():String {
                // Marshal native view state onto the UI thread, never read WebView state on this bridge thread.
                val task=java.util.concurrent.FutureTask {contextProvider().toString()}
                activity.runOnUiThread(task)
                return task.get(3,java.util.concurrent.TimeUnit.SECONDS)
            }
            @JavascriptInterface fun ask(raw:String) {
                if(!alive||raw.length>65536)return
                val request=runCatching {JSONObject(raw)}.getOrNull()?:return
                val id=request.optString("id");if(!id.matches(Regex("[0-9]{1,9}")))return
                worker.execute {
                    val response=runCatching {model.ask(request)}.getOrElse {JSONObject().put("error","MODEL_UNAVAILABLE")}
                    activity.runOnUiThread {if(alive)web.evaluateJavascript("globalThis.lyraReceive(${JSONObject.quote(id)},${response});",null)}
                }
            }
        },"ObservatoryNative")
        val settings=Button(activity).apply {text="ตั้งค่า AI";setOnClickListener {configure(activity,model){if(alive)web.reload()}}}
        column.addView(settings);column.addView(web,LinearLayout.LayoutParams(-1,0,1f))
        val dialog=AlertDialog.Builder(activity).setTitle("ไลร่า · หอดูดาว").setView(column).setNegativeButton("กลับ",null).create()
        dialog.setOnDismissListener {alive=false;worker.shutdownNow();web.removeJavascriptInterface("ObservatoryNative");web.destroy()}
        dialog.show();dialog.window?.setLayout(-1,(activity.resources.displayMetrics.heightPixels*.85).toInt())
        web.loadUrl("https://appassets.androidplatform.net/lyra/index.html")
    }
    private fun configure(activity:Activity,model:ModelConnection,done:()->Unit) {
        val form=LinearLayout(activity).apply {orientation=LinearLayout.VERTICAL;setPadding(24,12,24,12)}
        val endpoint=EditText(activity).apply {hint="HTTPS chat-completions endpoint";setSingleLine();setText(model.configuration()?.endpoint.orEmpty())}
        val name=EditText(activity).apply {hint="ชื่อโมเดล";setSingleLine();setText(model.configuration()?.model.orEmpty())}
        val token=EditText(activity).apply {hint="API credential";inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD}
        form.addView(endpoint);form.addView(name);form.addView(token)
        AlertDialog.Builder(activity).setTitle("เชื่อม AI ของบิ๊ก").setView(form).setNegativeButton("ยกเลิก",null)
            .setNeutralButton("ตัดการเชื่อมต่อ"){_,_->model.disconnect();done()}
            .setPositiveButton("บันทึก"){_,_->runCatching {model.save(ModelConfiguration(endpoint.text.toString().trim(),name.text.toString().trim()),token.text.toString())}.onSuccess {token.text.clear();done()}.onFailure {Toast.makeText(activity,"ตรวจ endpoint / model / credential อีกครั้งครับ",Toast.LENGTH_LONG).show()}}.show()
    }
}
