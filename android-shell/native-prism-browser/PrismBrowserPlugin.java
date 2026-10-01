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
    SharedPreferences s=getContext().getSharedPreferences("prism_browser_session",android.content.Context.MODE_PRIVATE);
    JSObject out=new JSObject();
    out.put("schemaVersion",e.getString("schemaVersion","UNKNOWN"));
    out.put("source",e.getString("source","PRISM_BROWSER"));
    out.put("event",e.getString("event","UNKNOWN"));
    out.put("url",e.getString("url",""));
    out.put("capturedAt",e.getLong("capturedAt",0));
    out.put("activeTab",e.getInt("activeTab",-1));
    out.put("tabCount",e.getInt("tabCount",s.getInt("tabCount",0)));
    out.put("latestEnvelope",e.getString("latestEnvelope",""));
    out.put("sessionSchemaVersion",s.getString("sessionSchemaVersion","UNKNOWN"));
    out.put("sessionEnvelope",s.getString("sessionEnvelope",""));
    out.put("sessionActiveTab",s.getInt("activeTab",-1));
    out.put("sessionActiveUrl",s.getString("activeUrl",""));
    out.put("verified",e.getLong("capturedAt",0)>0 && s.getString("sessionEnvelope","").length()>0);
    call.resolve(out);
  }

  @PluginMethod public void open(PluginCall call) {
    Intent intent = new Intent(getContext(), PrismBrowserActivity.class);
    getActivity().startActivity(intent);
    call.resolve();
  }
}
