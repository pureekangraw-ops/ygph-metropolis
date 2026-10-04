package com.yggdrasil.prism;

import android.content.Context;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.RejectedExecutionException;
import org.json.JSONObject;
import org.mozilla.geckoview.*;

/** Capture capability only. No Firefox background producer or browser commands. */
public final class PrismPageObserver {
  private static PrismPageObserver instance;
  private final PrismObserverCredentials credentials;
  private final Context context;
  private final ThreadPoolExecutor publisher=new ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,new LinkedBlockingQueue<Runnable>(2));
  private volatile int epoch;
  private volatile long captureNotBefore;
  private WebExtension extension;
  private PrismPageObserver(Context context){this.context=context.getApplicationContext();credentials=new PrismObserverCredentials(this.context);}
  public static synchronized PrismPageObserver get(Context context){if(instance==null)instance=new PrismPageObserver(context);return instance;}
  public void install(GeckoRuntime runtime){
    runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/prism-observer/","prism-native-observer@yggmetro.com").accept(e->{extension=e;PrismBrowserActivity.bindObserverTabs();},error->state("UNSUPPORTED"));
  }
  public void bind(GeckoSession session){
    if(extension==null)return;
    session.getWebExtensionController().setMessageDelegate(extension,new WebExtension.MessageDelegate(){
      @Override public GeckoResult<Object> onMessage(String nativeApp,Object message,WebExtension.MessageSender sender){
        if(!"prism_observer".equals(nativeApp)||!sender.isTopLevel()||sender.session!=PrismBrowserActivity.observerActiveSession()||!PrismBrowserActivity.isObserverForeground()||!(message instanceof JSONObject))return null;
        JSONObject input=(JSONObject)message,page=input.optJSONObject("page");
        if(!"ERGASTERION_FACTORY_EYE_CONTENT_PULSE".equals(input.optString("type"))||page==null||!input.optBoolean("visible")||!"visible".equals(page.optString("visibilityState"))||page.optBoolean("capturesInputValues",true)||page.optBoolean("createsAuthority",true))return null;
        try {
          String pageUrl=safeUrl(page.optString("url"));
          if(pageUrl==null||!pageUrl.equals(safeUrl(PrismBrowserActivity.liveActiveUrl())))return null;
          long captured=Instant.parse(page.optString("capturedAt")).toEpochMilli(),now=System.currentTimeMillis();
          if(PrismBrowserActivity.observerNavigationPending()||captured<=captureNotBefore||captured>now||now-captured>30000L)return null;
          page.put("url",pageUrl);page.remove("fields");
          JSONObject config=credentials.load();if(config==null){state("PAIRING_REQUIRED");return null;}
          if(config.optLong("expiresAt")<=now){state("PAIRING_REQUIRED");return null;}
          JSONObject packet=envelope(config);String tab=PrismBrowserActivity.observerActiveTabId();
          packet.put("capturedAt",page.optString("capturedAt"));packet.put("activeTabId",tab);packet.put("observationTabId",tab);packet.put("documentVisible",true);packet.put("page",page);
          int captureEpoch=epoch;enqueue(config,packet,captureEpoch,false);
        }catch(Exception error){state("REJECTED");}
        return null;
      }
    },"prism_observer");
  }
  private JSONObject envelope(JSONObject config) throws Exception {
    JSONObject packet=new JSONObject();JSONObject work=config.getJSONObject("workContext");
    packet.put("schemaVersion","PRISM_FACTORY_OBSERVATION_V1");packet.put("source","PRISM_BROWSER");packet.put("sessionId",config.getString("sessionId"));packet.put("adapterId",config.getString("adapterId"));packet.put("workId",work.getString("workId"));packet.put("checkpointId",work.getString("checkpointId"));packet.put("observationId","PRISM-"+UUID.randomUUID());packet.put("sequence",credentials.nextSequence());packet.put("capturedAt",Instant.now().toString());packet.put("observerVersion","0.3.1");packet.put("capturesInputValues",false);packet.put("createsAuthority",false);return packet;
  }
  public void invalidate(){
    captureNotBefore=System.currentTimeMillis();int invalidationEpoch=++epoch;
    try {JSONObject config=credentials.load();if(config==null)return;state("STALE");JSONObject packet=envelope(config);packet.put("kind","INVALIDATE");packet.put("documentVisible",false);enqueue(config,packet,invalidationEpoch,true);}catch(Exception ignored){}
  }
  public void navigationStarted(){invalidate();}
  public void navigationStopped(){captureNotBefore=System.currentTimeMillis();}
  public void disconnect(){invalidate();credentials.clear();}
  private synchronized void enqueue(JSONObject config,JSONObject packet,int captureEpoch,boolean invalidation){
    if(invalidation)publisher.getQueue().clear();
    else if(publisher.getQueue().remainingCapacity()==0)return;
    try {publisher.execute(()->{
      try {
        if(captureEpoch!=epoch||(!invalidation&&!PrismBrowserActivity.isObserverForeground()))return;
        JSONObject current=credentials.load();if(!invalidation&&(current==null||!current.optString("sessionId").equals(config.optString("sessionId"))))return;
        String body=packet.toString();int response=-1;JSONObject receipt=null;
        for(int attempt=0;attempt<2;attempt++){
          if(captureEpoch!=epoch)return;
          HttpURLConnection connection=null;
          try {
            connection=(HttpURLConnection)new URL(config.getString("factoryOrigin")+"/api/prism-eye/observe").openConnection();
            connection.setConnectTimeout(4000);connection.setReadTimeout(4000);connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Authorization","Bearer "+config.getString("sessionToken"));
            try(java.io.OutputStream out=connection.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}
            response=connection.getResponseCode();
            if(response>=200&&response<300){try(java.io.InputStream in=connection.getInputStream()){receipt=new JSONObject(readReceipt(in));}break;}
            if(response<500&&response!=429)break;
          }catch(Exception error){response=-1;}finally{if(connection!=null)connection.disconnect();}
        }
        if(invalidation)return;
        JSONObject latestConfig=credentials.load();if(latestConfig==null||!latestConfig.optString("sessionId").equals(config.optString("sessionId"))||captureEpoch!=epoch)return;
        if(receipt!=null&&receipt.optJSONObject("workContext")!=null&&receipt.optBoolean("ok")&&packet.optString("observationId").equals(receipt.optString("observationId"))&&packet.optString("workId").equals(receipt.optJSONObject("workContext").optString("workId"))&&packet.optString("checkpointId").equals(receipt.optJSONObject("workContext").optString("checkpointId"))){
                    long captured=Instant.parse(packet.getString("capturedAt")).toEpochMilli();
          credentials.status().edit().putString("state","PUBLISHED").putLong("capturedAt",captured).putLong("publishedAt",System.currentTimeMillis()).putString("observationId",packet.getString("observationId")).apply();
          context.getSharedPreferences("prism_observer_state",Context.MODE_PRIVATE).edit().putLong("lastEvidenceAt",captured).apply();
        }else state(response==401?"PAIRING_REQUIRED":response>=400&&response<500?"REJECTED":"OFFLINE");
      }catch(Exception error){state("OFFLINE");}
    });}catch(RejectedExecutionException error){state("OFFLINE");}
  }
  private static String readReceipt(java.io.InputStream in) throws Exception {
    java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[1024];int count;
    while((count=in.read(buffer))!=-1){if(out.size()+count>8192)throw new Exception("PRISM_RECEIPT_TOO_LARGE");out.write(buffer,0,count);}
    return new String(out.toByteArray(),StandardCharsets.UTF_8);
  }
  private void state(String value){credentials.status().edit().putString("state",value).apply();}
  private static String safeUrl(String raw){try{URI u=new URI(raw);if(!"https".equals(u.getScheme())&&!"http".equals(u.getScheme()))return null;if(u.getHost()==null)return null;return new URI(u.getScheme(),null,u.getHost(),u.getPort(),u.getPath()==null||u.getPath().isEmpty()?"/":u.getPath(),null,null).toString();}catch(Exception error){return null;}}
}
