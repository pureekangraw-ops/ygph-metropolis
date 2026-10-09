package com.big.gobrowser.ui

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.big.gobrowser.R

/** Native adaptation of PRISM theme.css Graphite/Lime and ui/icons.mjs paths. */
object ObservatoryTheme {
    val background=Color.rgb(16,21,22)
    val panel=Color.rgb(32,41,42)
    val text=Color.rgb(244,246,242)
    val muted=Color.rgb(178,188,186)
    val lime=Color.rgb(199,244,100)
    val warning=Color.rgb(255,200,87)
    fun dp(context:Context,value:Int)=(value*context.resources.displayMetrics.density).toInt()
    fun apply(activity:Activity,root:LinearLayout) {
        root.setBackgroundColor(background)
        activity.window.statusBarColor=background;activity.window.navigationBarColor=background
        activity.window.decorView.systemUiVisibility=0
    }
    fun surface(context:Context)=GradientDrawable().apply {setColor(panel);cornerRadius=dp(context,12).toFloat();setStroke(dp(context,1),Color.rgb(58,71,73))}
    fun address(view:EditText){view.setTextColor(text);view.setHintTextColor(muted);view.background=surface(view.context);view.setPadding(dp(view.context,12),dp(view.context,10),dp(view.context,12),dp(view.context,10));view.textSize=15f}
    fun title(context:Context,label:String)=TextView(context).apply {text=label;setTextColor(lime);textSize=19f;setPadding(dp(context,12),dp(context,8),dp(context,12),dp(context,2))}
    fun status(context:Context)=TextView(context).apply {setTextColor(muted);textSize=12f;setPadding(dp(context,12),dp(context,4),dp(context,12),dp(context,6));accessibilityLiveRegion=android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE}
    fun button(context:Context,label:String,action:()->Unit)=Button(context).apply {
        text=label;isAllCaps=false;textSize=13f;minWidth=0;minimumWidth=0;minHeight=dp(context,48);minimumHeight=dp(context,48)
        setTextColor(textColor());backgroundTintList=null
        background=RippleDrawable(ColorStateList.valueOf(Color.argb(45,199,244,100)),surface(context),null)
        setPadding(dp(context,12),dp(context,6),dp(context,12),dp(context,6))
        layoutParams=LinearLayout.LayoutParams(-2,-2).apply {setMargins(dp(context,3),dp(context,3),dp(context,3),dp(context,3))}
        setOnClickListener {action()}
    }
    private fun textColor()=text
    fun iconButton(context:Context,icon:Int,label:String,action:()->Unit)=button(context,"",action).apply {
        contentDescription=label
        setCompoundDrawablesWithIntrinsicBounds(0,icon,0,0)
        layoutParams=LinearLayout.LayoutParams(dp(context,48),dp(context,48)).apply {setMargins(dp(context,3),dp(context,3),dp(context,3),dp(context,3))}
    }
    fun online(context:Context):Boolean {
        val manager=context.getSystemService(ConnectivityManager::class.java)
        val network=manager.activeNetwork?:return false
        return manager.getNetworkCapabilities(network)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)==true
    }
}
