package com.yggdrasil.prism;

import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="PrismBrowser")
public class PrismBrowserPlugin extends Plugin {
  @PluginMethod public void getEvidence(PluginCall call) {
    SharedPreferences e=getContext().getSharedPreferences("prism_browser_evidence",android.content.Context.MODE_PRIVATE);
    JSObject out=new JSObject();
    out.put("event",e.getString("event","UNKNOWN"));
    out.put("url",e.getString("url",""));
    out.put("capturedAt",e.getLong("capturedAt",0));
    out.put("verified",e.getLong("capturedAt",0)>0);
    call.resolve(out);
  }

  @PluginMethod public void open(PluginCall call) {
    Intent intent = new Intent(getContext(), PrismBrowserActivity.class);
    getActivity().startActivity(intent);
    call.resolve();
  }
}
