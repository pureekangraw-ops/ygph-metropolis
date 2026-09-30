package com.yggdrasil.prism;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.mozilla.geckoview.*;

public class PrismBrowserActivity extends Activity {
  private static final String HOME_URL="https://github.com/pureekangraw-ops";
  private static final String[] WATCH_URLS={"https://github.com/pureekangraw-ops","https://dash.cloudflare.com/"};
  private static GeckoRuntime runtime;
  private final List<GeckoSession> tabs=new ArrayList<>();
  private final List<String> urls=new ArrayList<>();
  private int active=-1;
  private GeckoView view; private LinearLayout tabBar; private EditText url; private TextView eye;

  @Override public void onCreate(Bundle state){
    super.onCreate(state); setContentView(R.layout.activity_prism_browser);
    view=findViewById(R.id.prism_gecko); tabBar=findViewById(R.id.prism_tabs); url=findViewById(R.id.prism_url); eye=findViewById(R.id.prism_eye_status);
    if(runtime==null) runtime=GeckoRuntime.create(this);
    FactoryEyeHost.install(runtime, s->runOnUiThread(()->eye.setText(s)));
    findViewById(R.id.prism_go).setOnClickListener(v->navigate());
    findViewById(R.id.prism_back).setOnClickListener(v->{if(current()!=null)current().goBack();});
    findViewById(R.id.prism_forward).setOnClickListener(v->{if(current()!=null)current().goForward();});
    findViewById(R.id.prism_reload).setOnClickListener(v->{if(current()!=null)current().reload();});
    findViewById(R.id.prism_watch).setOnClickListener(v->watch());
    url.setOnEditorActionListener((v,id,e)->{if(id==EditorInfo.IME_ACTION_GO){navigate();return true;}return false;});
    addTab(HOME_URL);
  }
  private GeckoSession current(){return active>=0&&active<tabs.size()?tabs.get(active):null;}
  private void addTab(String target){
    GeckoSession s=new GeckoSession(); s.setContentDelegate(new GeckoSession.ContentDelegate(){});
    s.setNavigationDelegate(new GeckoSession.NavigationDelegate(){
      @Override public void onLocationChange(GeckoSession session,String location,List<GeckoSession.PermissionDelegate.ContentPermission> permissions,Boolean gesture){
        int i=tabs.indexOf(session); if(i>=0&&location!=null){urls.set(i,location);if(i==active)runOnUiThread(()->url.setText(location));}
      }
    });
    s.open(runtime); tabs.add(s); urls.add(target); active=tabs.size()-1; renderTabs(); attach(); s.loadUri(target);
  }
  private void attach(){if(current()!=null){view.setSession(current());url.setText(urls.get(active));}}
  private void navigate(){String q=url.getText().toString().trim();if(q.isEmpty())return;String target;
    if(q.startsWith("http://")||q.startsWith("https://"))target=q;else if(q.contains(" "))target="https://www.google.com/search?q="+URLEncoder.encode(q,StandardCharsets.UTF_8);else target="https://"+q;
    urls.set(active,target);current().loadUri(target);
  }
  private void watch(){Set<String> have=new HashSet<>(urls);for(String target:WATCH_URLS)if(!have.contains(target))addTab(target);eye.setText("Factory Eye · Watch "+WATCH_URLS.length+" targets");}
  private void select(int i){if(i<0||i>=tabs.size())return;active=i;renderTabs();attach();}
  private void close(int i){if(i<0||i>=tabs.size())return;if(tabs.size()==1){finish();return;}tabs.get(i).close();tabs.remove(i);urls.remove(i);active=Math.min(active,tabs.size()-1);renderTabs();attach();}
  private void renderTabs(){tabBar.removeAllViews();for(int i=0;i<tabs.size();i++){final int n=i;LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);
      Button b=new Button(this);b.setText(i==active?"● "+(i+1):String.valueOf(i+1));b.setOnClickListener(v->select(n));Button x=new Button(this);x.setText("×");x.setOnClickListener(v->close(n));row.addView(b);row.addView(x);tabBar.addView(row);}
    Button plus=new Button(this);plus.setText("+");plus.setOnClickListener(v->addTab(HOME_URL));tabBar.addView(plus);
  }
  @Override protected void onDestroy(){for(GeckoSession s:tabs)s.close();tabs.clear();super.onDestroy();}
}
