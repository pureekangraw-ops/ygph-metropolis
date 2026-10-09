package com.big.gobrowser.browser;

import android.app.*;
import android.content.*;
import android.os.*;
import android.net.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Truthful foreground status for the process-scoped Observatory observer. */
public final class GeckoObserverService extends Service {
  public static final String FOREGROUND="com.big.gobrowser.browser.OBSERVATORY_FOREGROUND";
  public static final String BACKGROUND="com.big.gobrowser.browser.OBSERVATORY_BACKGROUND";
  private static volatile boolean foreground;
  private final Handler handler=new Handler(Looper.getMainLooper()); private final AtomicBoolean running=new AtomicBoolean(false);
  private SharedPreferences state;
  public static void mark(Context c, boolean value){ foreground=value; Intent i=new Intent(c,GeckoObserverService.class).setAction(value?FOREGROUND:BACKGROUND); if(Build.VERSION.SDK_INT>=26)c.startForegroundService(i);else c.startService(i); }
  @Override public void onCreate(){super.onCreate();state=getSharedPreferences("observatory-observer-state",MODE_PRIVATE);createChannel();startForeground(84,notification("STARTING"));running.set(true);handler.post(tick);}
  @Override public int onStartCommand(Intent intent,int flags,int id){if(intent!=null)foreground=FOREGROUND.equals(intent.getAction());return START_STICKY;}
  private final Runnable tick=new Runnable(){@Override public void run(){if(!running.get())return;boolean online=network();String s=online?(foreground?"LIVE":"WAITING"):"OFFLINE";state.edit().putString("state",s).putLong("stateAt",System.currentTimeMillis()).apply();NotificationManager n=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);if(n!=null)n.notify(84,notification(s));handler.postDelayed(this,5000L);}};
  private boolean network(){ConnectivityManager c=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);if(c==null)return false;if(Build.VERSION.SDK_INT>=23){Network n=c.getActiveNetwork();return n!=null&&c.getNetworkCapabilities(n)!=null;}return c.getActiveNetworkInfo()!=null&&c.getActiveNetworkInfo().isConnected();}
  private Notification notification(String s){PendingIntent p=PendingIntent.getActivity(this,0,new Intent(this,GeckoBrowserActivity.class),Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0);return Build.VERSION.SDK_INT>=26?new Notification.Builder(this,"observatory-gecko").setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("Observatory Gecko "+s).setContentText("Owner browser observer · no password capture").setOngoing(true).setContentIntent(p).build():new Notification.Builder(this).setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("Observatory Gecko "+s).setOngoing(true).build();}
  private void createChannel(){if(Build.VERSION.SDK_INT>=26){NotificationChannel c=new NotificationChannel("observatory-gecko","Observatory Gecko Observer",NotificationManager.IMPORTANCE_LOW);c.setDescription("Owner-initiated browser observation status");((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);}}
  @Override public void onDestroy(){running.set(false);handler.removeCallbacksAndMessages(null);state.edit().putString("state","OFFLINE").apply();super.onDestroy();}
  @Override public IBinder onBind(Intent i){return null;}
}
