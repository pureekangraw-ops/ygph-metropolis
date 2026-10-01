package com.yggdrasil.prism;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/**
 * Process-scoped observer supervisor. Android may still kill this process; the
 * browser session remains persisted and the next Activity start restores it.
 * This service reports truthfully when observation is live, background, stale,
 * or offline and never manufactures a page/evidence payload.
 */
public final class PrismObserverService extends Service {
  public static final String ACTION_ACTIVITY_FOREGROUND="com.yggdrasil.prism.OBSERVER_FOREGROUND";
  public static final String ACTION_ACTIVITY_BACKGROUND="com.yggdrasil.prism.OBSERVER_BACKGROUND";
  private static final String PREFS="prism_observer_state";
  private static final String CHANNEL="prism_factory_eye";
  private static final long TICK_MS=5000L;
  private static final long STALE_AFTER_MS=20000L;
  private static volatile boolean activityForeground;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final AtomicBoolean running=new AtomicBoolean(false);
  private android.content.SharedPreferences state;

  public static void markActivityForeground(Context context){
    activityForeground=true;
    Intent i=new Intent(context,PrismObserverService.class).setAction(ACTION_ACTIVITY_FOREGROUND);
    if(Build.VERSION.SDK_INT>=26)context.startForegroundService(i);else context.startService(i);
  }
  public static void markActivityBackground(Context context){
    activityForeground=false;
    Intent i=new Intent(context,PrismObserverService.class).setAction(ACTION_ACTIVITY_BACKGROUND);
    if(Build.VERSION.SDK_INT>=26)context.startForegroundService(i);else context.startService(i);
  }

  @Override public void onCreate(){
    super.onCreate();
    state=getSharedPreferences(PREFS,MODE_PRIVATE);
    createChannel();
    startForeground(42,notification("STARTING"));
    running.set(true);
    handler.post(tick);
  }

  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent!=null&&ACTION_ACTIVITY_FOREGROUND.equals(intent.getAction()))activityForeground=true;
    if(intent!=null&&ACTION_ACTIVITY_BACKGROUND.equals(intent.getAction()))activityForeground=false;
    return START_STICKY;
  }

  private final Runnable tick=new Runnable(){
    @Override public void run(){
      if(!running.get())return;
      updateState();
      handler.postDelayed(this,TICK_MS);
    }
  };

  private boolean networkAvailable(){
    ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
    if(cm==null)return false;
    if(Build.VERSION.SDK_INT>=23){
      Network n=cm.getActiveNetwork();
      return n!=null&&cm.getNetworkCapabilities(n)!=null;
    }
    return cm.getActiveNetworkInfo()!=null&&cm.getActiveNetworkInfo().isConnected();
  }

  private void updateState(){
    long now=System.currentTimeMillis();
    long lastEvidence=state.getLong("lastEvidenceAt",0L);
    long age=lastEvidence>0?now-lastEvidence:Long.MAX_VALUE;
    String next;
    if(!networkAvailable())next="OFFLINE";
    else if(!PrismBrowserActivity.hasLiveBrowserSessions())next="STALE";
    else if(age>STALE_AFTER_MS)next="STALE";
    else next=activityForeground?"LIVE":"BACKGROUND";
    String unknowns="[]";
    if("OFFLINE".equals(next))unknowns="[\"NETWORK_UNAVAILABLE\"]";
    else if("STALE".equals(next))unknowns="[\"NO_FRESH_PRISM_EVIDENCE\"]";
    JSONObject envelope=new JSONObject();
    try{
      envelope.put("schemaVersion","prism-observer-state-v1");
      envelope.put("state",next);
      envelope.put("stateAt",now);
      envelope.put("heartbeatAt",now);
      envelope.put("activeTab",PrismBrowserActivity.liveActiveTab());
      envelope.put("activeUrl",PrismBrowserActivity.liveActiveUrl());
      envelope.put("tabCount",PrismBrowserActivity.liveTabCount());
      envelope.put("lastEvidenceAt",lastEvidence);
      envelope.put("unknowns",new org.json.JSONArray(unknowns));
      envelope.put("capturesInputValues",false);
    }catch(Exception ignored){}
    state.edit().putString("state",next).putLong("stateAt",now).putLong("heartbeatAt",now)
      .putString("unknowns",unknowns).putString("stateEnvelope",envelope.toString()).apply();
    NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
    if(nm!=null)nm.notify(42,notification(next));
  }

  private Notification notification(String status){
    PendingIntent pi=PendingIntent.getActivity(this,0,new Intent(this,PrismBrowserActivity.class),
      Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0);
    if(Build.VERSION.SDK_INT>=26)return new Notification.Builder(this,CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("PRISM • Factory Eye "+status)
      .setContentText("GO Eye observer · Android capability boundary respected")
      .setOngoing(true).setContentIntent(pi).build();
    return new Notification.Builder(this).setSmallIcon(android.R.drawable.ic_menu_view)
      .setContentTitle("PRISM • Factory Eye "+status).setOngoing(true).setContentIntent(pi).build();
  }
  private void createChannel(){
    if(Build.VERSION.SDK_INT>=26){
      NotificationChannel c=new NotificationChannel(CHANNEL,"PRISM Factory Eye",NotificationManager.IMPORTANCE_LOW);
      c.setDescription("Persistent observer status; no passwords or private input values");
      NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);if(nm!=null)nm.createNotificationChannel(c);
    }
  }
  @Override public void onDestroy(){
    running.set(false);handler.removeCallbacksAndMessages(null);
    if(state!=null)state.edit().putString("state","OFFLINE").putLong("stateAt",System.currentTimeMillis()).putString("unknowns","[\"SERVICE_STOPPED\"]").apply();
    super.onDestroy();
  }
  @Override public IBinder onBind(Intent intent){return null;}
}
