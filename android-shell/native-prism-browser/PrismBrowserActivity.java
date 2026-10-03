package com.yggdrasil.prism;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;
import org.mozilla.geckoview.*;

public class PrismBrowserActivity extends Activity {
  private static final String HOME_URL="https://github.com/pureekangraw-ops";
  private static final String[] WATCH_URLS={"https://github.com/pureekangraw-ops","https://dash.cloudflare.com/"};
  private static final String EVIDENCE_PREFS="prism_browser_evidence";
  private static final String SESSION_PREFS="prism_browser_session";
  private static final String EVIDENCE_SCHEMA="prism-browser-evidence-v1";
  private static final String SESSION_SCHEMA="prism-browser-session-v1";
  private static GeckoRuntime runtime;
  private static final List<GeckoSession> tabs=new ArrayList<>();
  private static final List<String> urls=new ArrayList<>();
  private static int active=-1;
  private static final Map<GeckoSession,GeckoSession.SessionState> savedStates=new HashMap<>();
  private static final Map<GeckoSession,String> tabIds=new HashMap<>();
  private static final Map<GeckoSession,Integer> recoveryAttempts=new HashMap<>();
  private PrismBrowserRecovery recovery;
  private GeckoView view; private LinearLayout tabBar; private EditText url; private TextView eye;
  private SharedPreferences evidence; private SharedPreferences session;

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    startObserverService();
    setContentView(R.layout.activity_prism_browser);
    applySystemBarInsets();
    view=findViewById(R.id.prism_gecko); tabBar=findViewById(R.id.prism_tabs); url=findViewById(R.id.prism_url); eye=findViewById(R.id.prism_eye_status);
    evidence=getSharedPreferences(EVIDENCE_PREFS,MODE_PRIVATE);
    session=getSharedPreferences(SESSION_PREFS,MODE_PRIVATE);
    recovery=new PrismBrowserRecovery(getApplicationContext());
    if(runtime==null) runtime=GeckoRuntime.create(getApplicationContext());
    findViewById(R.id.prism_go).setOnClickListener(v->navigate());
    findViewById(R.id.prism_back).setOnClickListener(v->{if(current()!=null)current().goBack();});
    findViewById(R.id.prism_forward).setOnClickListener(v->{if(current()!=null)current().goForward();});
    findViewById(R.id.prism_reload).setOnClickListener(v->{GeckoSession tab=current();if(tab==null)return;if(tab.isOpen())tab.reload();else{recoveryAttempts.remove(tab);recoverContent(tab,"OWNER_RELOAD");}});
    findViewById(R.id.prism_watch).setOnClickListener(v->watch());
    findViewById(R.id.prism_new_tab).setOnClickListener(v->addTab(HOME_URL,true));
    findViewById(R.id.prism_close_tab).setOnClickListener(v->close(active));
    url.setOnEditorActionListener((v,id,e)->{if(id==EditorInfo.IME_ACTION_GO){navigate();return true;}return false;});
    restoreSession();
    for(GeckoSession tab:tabs)bindTabCallbacks(tab);
  }

  private void applySystemBarInsets(){
    Window window=getWindow();
    window.setStatusBarColor(Color.rgb(7,11,19));
    window.setNavigationBarColor(Color.rgb(7,11,19));
    View root=findViewById(R.id.prism_browser_root);
    root.setOnApplyWindowInsetsListener((v,insets)->{
      int top=insets.getSystemWindowInsetTop();
      int bottom=insets.getSystemWindowInsetBottom();
      v.setPadding(0,top,0,bottom);
      return insets;
    });
    root.requestApplyInsets();
  }

  private void startObserverService(){
    Intent intent=new Intent();
    intent.setClassName("com.yggdrasil.prism","com.yggdrasil.prism.PrismObserverService");
    intent.setAction("com.yggdrasil.prism.OBSERVER_FOREGROUND");
    if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(intent);else startService(intent);
  }

  public static boolean hasLiveBrowserSessions(){return runtime!=null&&active>=0&&active<tabs.size()&&tabs.get(active).isOpen();}
  public static int liveTabCount(){return tabs.size();}
  public static int liveActiveTab(){return active;}
  public static String liveActiveUrl(){return active>=0&&active<urls.size()?urls.get(active):"";}

  private void sendObserverCommand(String action){
    Intent intent=new Intent();
    intent.setClassName("com.yggdrasil.prism","com.yggdrasil.prism.PrismObserverService");
    intent.setAction(action);
    if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(intent);else startService(intent);
  }

  @Override protected void onResume(){
    super.onResume();
    attach();
    updateSessionVisibility(true);
    sendObserverCommand("com.yggdrasil.prism.OBSERVER_FOREGROUND");
  }

  @Override protected void onPause(){
    updateSessionVisibility(false);
    persistSession();
    releaseViewSession();
    sendObserverCommand("com.yggdrasil.prism.OBSERVER_BACKGROUND");
    super.onPause();
  }

  @Override public void onWindowFocusChanged(boolean focused){
    super.onWindowFocusChanged(focused);
    updateSessionVisibility(focused);
  }

  private GeckoSession current(){return active>=0&&active<tabs.size()?tabs.get(active):null;}

  private void releaseViewSession(){
    if(view==null)return;
    try{if(view.getSession()!=null)view.releaseSession();}catch(Exception ignored){}
  }

  private void updateSessionVisibility(boolean visible){
    for(int i=0;i<tabs.size();i++){
      GeckoSession target=tabs.get(i);
      boolean selected=visible&&i==active;
      try{target.setFocused(selected);}catch(Exception ignored){}
      try{target.setActive(selected);}catch(Exception ignored){}
    }
  }

  private void restoreSession(){
    if(!tabs.isEmpty()){
      active=Math.max(0,Math.min(active,tabs.size()-1));
      renderTabs(); attach();
      recordEvidence("SESSION_REATTACHED",currentUrl());
      eye.setText("PRISM Browser · live session reattached · "+tabs.size()+" tabs");
      return;
    }
    String raw=session.getString("sessionEnvelope","");
    try{
      JSONObject envelope=new JSONObject(raw);
      JSONArray savedTabs=envelope.optJSONArray("tabs");
      if(savedTabs!=null&&savedTabs.length()>0){
        for(int i=0;i<savedTabs.length();i++){
          String target=savedTabs.optString(i,"").trim();
          if(!target.isEmpty()){
            JSONArray ids=envelope.optJSONArray("tabIds");
            String id=ids==null?"":ids.optString(i,"");
            GeckoSession.SessionState saved=recovery.read(id);
            createTab(target,saved==null);
            GeckoSession tab=current();
            if(!id.isEmpty())tabIds.put(tab,id);
            if(saved!=null){savedStates.put(tab,saved);tab.restoreState(saved);}
          }
        }
        int savedActive=envelope.optInt("activeTab",0);
        active=Math.max(0,Math.min(savedActive,tabs.size()-1));
        renderTabs(); attach();
        recordEvidence("SESSION_RESTORED",currentUrl());
        eye.setText("PRISM Browser · session restored · "+tabs.size()+" tabs");
        return;
      }
    }catch(Exception ignored){}
    addTab(HOME_URL,true);
  }

  private void addTab(String target,boolean load){
    createTab(target,load);
    renderTabs(); attach();
    persistSession();
  }

  private void createTab(String target,boolean load){
    GeckoSession previous=current();
    if(previous!=null){
      try{previous.setFocused(false);}catch(Exception ignored){}
      try{previous.setActive(false);}catch(Exception ignored){}
    }
    GeckoSession s=new GeckoSession();
    bindTabCallbacks(s);
    tabIds.put(s,UUID.randomUUID().toString());
    s.open(runtime); tabs.add(s); urls.add(target); active=tabs.size()-1;
    if(load)s.loadUri(target);
  }

  private void bindTabCallbacks(GeckoSession s){
    s.setContentDelegate(new GeckoSession.ContentDelegate(){
      @Override public void onCrash(GeckoSession tab){recoverContent(tab,"CONTENT_CRASH");}
      @Override public void onKill(GeckoSession tab){recoverContent(tab,"CONTENT_KILLED");}
    });
    s.setProgressDelegate(new GeckoSession.ProgressDelegate(){
      @Override public void onPageStop(GeckoSession tab,boolean success){if(success)recoveryAttempts.remove(tab);}
      @Override public void onSessionStateChange(GeckoSession tab,GeckoSession.SessionState value){
        if(!tabs.contains(tab))return;
        savedStates.put(tab,value);
        recovery.write(tabIds.get(tab),value);
        persistSession();
      }
    });
    s.setNavigationDelegate(new GeckoSession.NavigationDelegate(){
      @Override public void onLocationChange(GeckoSession session,String location,List<GeckoSession.PermissionDelegate.ContentPermission> permissions,Boolean gesture){
        int i=tabs.indexOf(session);
        if(i>=0&&location!=null){
          urls.set(i,location);
          if(i==active)runOnUiThread(()->url.setText(location));
          recordEvidence("LOCATION",location);
          persistSession();
        }
      }
    });
  }

  private void recoverContent(GeckoSession tab,String reason){
    int i=tabs.indexOf(tab);if(i<0)return;
    recordEvidence(reason,urls.get(i));
    int attempts=recoveryAttempts.getOrDefault(tab,0);
    if(attempts>0){eye.setText("Browser · tap reload to retry recovery");return;}
    recoveryAttempts.put(tab,attempts+1);
    try{
      if(view!=null&&view.getSession()==tab)releaseViewSession();
      GeckoSession.SessionState saved=savedStates.get(tab);
      if(saved==null)saved=recovery.read(tabIds.get(tab));
      tab.open(runtime);
      if(saved!=null)tab.restoreState(saved);else tab.loadUri(urls.get(i));
      if(i==active)attach();
      eye.setText("Browser · recovered after "+reason);
    }catch(Exception error){
      eye.setText("Browser · recovery required");
      getSharedPreferences("prism_observer_state",MODE_PRIVATE).edit().putString("state","STALE").putString("unknowns","[\"CONTENT_RECOVERY_FAILED\"]").commit();
    }
  }

  private void attach(){
    GeckoSession target=current();
    if(view==null||target==null)return;
    try{
      GeckoSession attached=view.getSession();
      if(attached!=target){
        if(attached!=null)view.releaseSession();
        view.setSession(target);
      }
    }catch(Exception ignored){}
    updateSessionVisibility(hasWindowFocus());
    url.setText(urls.get(active));
    recordEvidence("ACTIVE_TAB",currentUrl());
  }

  private void navigate(){
    String q=url.getText().toString().trim(); if(q.isEmpty()||current()==null)return;
    String target;
    if(q.startsWith("http://")||q.startsWith("https://"))target=q;
    else if(q.contains(" "))target="https://www.google.com/search?q="+URLEncoder.encode(q,StandardCharsets.UTF_8);
    else target="https://"+q;
    urls.set(active,target); current().loadUri(target); persistSession();
  }

  private void watch(){
    int selected=active;
    Set<String> have=new HashSet<>(urls);
    for(String target:WATCH_URLS)if(!have.contains(target))createTab(target,true);
    active=Math.max(0,Math.min(selected,tabs.size()-1));
    renderTabs(); attach();
    recordEvidence("WATCH",currentUrl());
    eye.setText("PRISM Browser · Watch "+WATCH_URLS.length+" targets · ready");
    persistSession();
  }

  private String currentUrl(){return active>=0&&active<urls.size()?urls.get(active):"";}

  private void recordEvidence(String event,String location){
    long capturedAt=System.currentTimeMillis();
    JSONObject envelope=new JSONObject();
    try {
      envelope.put("schemaVersion",EVIDENCE_SCHEMA);
      envelope.put("source","PRISM_BROWSER");
      envelope.put("event",event);
      envelope.put("url",location==null?"":location);
      envelope.put("capturedAt",capturedAt);
      envelope.put("activeTab",active);
      envelope.put("tabCount",tabs.size());
    } catch(Exception ignored) {}
    evidence.edit()
      .putString("schemaVersion",EVIDENCE_SCHEMA)
      .putString("source","PRISM_BROWSER")
      .putString("event",event)
      .putString("url",location==null?"":location)
      .putLong("capturedAt",capturedAt)
      .putInt("activeTab",active)
      .putInt("tabCount",tabs.size())
      .putString("latestEnvelope",envelope.toString())
      .apply();
    getSharedPreferences("prism_observer_state",MODE_PRIVATE).edit()
      .putLong("lastEvidenceAt",capturedAt).apply();
  }

  private void select(int i){
    if(i<0||i>=tabs.size())return;
    if(i==active){attach();return;}
    GeckoSession previous=current();
    if(previous!=null){
      try{previous.setFocused(false);}catch(Exception ignored){}
      try{previous.setActive(false);}catch(Exception ignored){}
    }
    active=i;
    renderTabs();
    attach();
    persistSession();
  }

  private void close(int i){
    if(i<0||i>=tabs.size())return;
    GeckoSession closing=tabs.get(i);
    try{closing.setFocused(false);}catch(Exception ignored){}
    try{closing.setActive(false);}catch(Exception ignored){}
    setExtensionTabActive(closing,false);
    if(view!=null&&view.getSession()==closing)releaseViewSession();
    if(tabs.size()==1){
      savedStates.remove(closing);recoveryAttempts.remove(closing);recovery.remove(tabIds.remove(closing));
      closing.close();
      tabs.clear(); urls.clear(); active=-1;
      persistSession(); finish(); return;
    }
    savedStates.remove(closing);recoveryAttempts.remove(closing);recovery.remove(tabIds.remove(closing));
    closing.close(); tabs.remove(i); urls.remove(i);
    if(i<active)active--;
    else if(i==active)active=Math.min(active,tabs.size()-1);
    renderTabs(); attach(); persistSession();
  }

  private void renderTabs(){
    tabBar.removeAllViews();
    for(int i=0;i<tabs.size();i++){
      final int n=i;
      Button b=new Button(this);
      b.setMinHeight(0); b.setMinimumHeight(0); b.setMinWidth(44); b.setPadding(8,0,8,0);
      b.setText(i==active?"● "+(i+1):String.valueOf(i+1));
      b.setOnClickListener(v->select(n));
      tabBar.addView(b);
    }
  }

  private void persistSession(){
    if(session==null)return;
    try{
      JSONArray savedTabs=new JSONArray();
      JSONArray savedIds=new JSONArray();
      for(GeckoSession tab:tabs)savedIds.put(tabIds.get(tab));
      for(String target:urls)savedTabs.put(target==null?"":target);
      JSONObject envelope=new JSONObject();
      envelope.put("schemaVersion",SESSION_SCHEMA);
      envelope.put("tabs",savedTabs);
      envelope.put("tabIds",savedIds);
      envelope.put("activeTab",active);
      envelope.put("activeUrl",currentUrl());
      envelope.put("savedAt",System.currentTimeMillis());
      session.edit()
        .putString("sessionSchemaVersion",SESSION_SCHEMA)
        .putString("sessionEnvelope",envelope.toString())
        .putInt("tabCount",urls.size())
        .putInt("activeTab",active)
        .putString("activeUrl",currentUrl())
        .commit();
    }catch(Exception ignored){}
  }

  @Override protected void onDestroy(){persistSession();releaseViewSession();super.onDestroy();}
}
