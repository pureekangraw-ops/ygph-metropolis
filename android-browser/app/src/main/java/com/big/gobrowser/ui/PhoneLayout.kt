package com.big.gobrowser.ui
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
object PhoneLayout {
    fun fitSystemBars(view:View) {
        val left=view.paddingLeft;val top=view.paddingTop;val right=view.paddingRight;val bottom=view.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(view) {v,insets->
            val safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(left+safe.left,top+safe.top,right+safe.right,bottom+safe.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(view)
    }
}
