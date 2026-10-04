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
    SharedPreferences o=getContext().getSharedPreferences("prism_observer_state",android.content.Context.MODE_PRIVATE);
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
    out.put("observerState",o.getString("state","OFFLINE"));
    out.put("observerStateAt",o.getLong("stateAt",0));
    out.put("observerHeartbeatAt",o.getLong("heartbeatAt",0));
    out.put("observerUnknowns",o.getString("unknowns","[]"));
    out.put("observerNotification","PRISM • Browser Eye "+o.getString("state","OFFLINE"));
    out.put("verified",e.getLong("capturedAt",0)>0 && s.getString("sessionEnvelope","").length()>0 && o.getLong("heartbeatAt",0)>0);
    SharedPreferences page=new PrismObserverCredentials(getContext()).status();
    out.put("pageObserverState",page.getString("state","PAIRING_REQUIRED"));
    out.put("pageCapturedAt",page.getLong("capturedAt",0));
    out.put("pagePublishedAt",page.getLong("publishedAt",0));
    out.put("pageObservationId",page.getString("observationId",""));
    out.put("pageObserverExpiresAt",page.getLong("expiresAt",0));
    out.put("pageScreenshotStatus","UNSUPPORTED");
    call.resolve(out);
  }

  @PluginMethod public void configureObserver(PluginCall call){
    try {new PrismObserverCredentials(getContext()).configure(call.getString("bootstrap",""));call.resolve();}
    catch(Exception error){call.reject("PRISM_OBSERVER_BOOTSTRAP_INVALID");}
  }
  @PluginMethod public void disconnectObserver(PluginCall call){PrismPageObserver.get(getContext()).disconnect();call.resolve();}

  @PluginMethod public void open(PluginCall call) {
    Intent intent = new Intent(getContext(), PrismBrowserActivity.class);
    getActivity().startActivity(intent);
    call.resolve();
  }
}
