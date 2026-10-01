package com.yggdrasil.prism;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="PrismBrowser")
public class PrismBrowserPlugin extends Plugin {
  @PluginMethod public void open(PluginCall call) {
    Intent intent = new Intent(getContext(), PrismBrowserActivity.class);
    getActivity().startActivity(intent);
    call.resolve();
  }
}
