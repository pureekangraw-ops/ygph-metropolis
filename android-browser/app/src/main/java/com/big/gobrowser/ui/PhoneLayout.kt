package com.big.gobrowser.ui
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
object PhoneLayout {
    fun fitSystemBars(root:View) {
        val left=root.paddingLeft;val top=root.paddingTop;val right=root.paddingRight;val bottom=root.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(root){view,insets->
            val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(left+bars.left,top+bars.top,right+bars.right,bottom+bars.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(root)
    }
}
