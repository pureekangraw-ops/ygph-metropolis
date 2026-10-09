package com.big.gobrowser.browser;
import org.junit.Test;
import static org.junit.Assert.*;

public class GeckoFrameLedgerTest {
  @Test public void routesSiblingFramesToTheirOwnPortAndLocalCapture() {
    GeckoFrameLedger<String,Object> ledger=new GeckoFrameLedger<>();
    Object top=new Object(),a=new Object(),b=new Object();
    ledger.observe("frame-0","top","c0","root",top,true);
    ledger.observe("frame-a","a","ca","child-a",a,false);
    ledger.observe("frame-b","b","cb","child-b",b,false);
    assertSame(a,ledger.route(ledger.captureId(),"frame-a").port);
    assertEquals("cb",ledger.route(ledger.captureId(),"frame-b").captureId);
    assertNull(ledger.route("old-capture","frame-a"));
  }
  @Test public void topNavigationDropsOldFramesAndOldDisconnectCannotRemoveReplacement() {
    GeckoFrameLedger<String,Object> ledger=new GeckoFrameLedger<>();
    Object old=new Object(),replacement=new Object();
    ledger.observe("frame-0","doc-1","c1","root",old,true);
    ledger.observe("frame-a","child","ca","child",old,false);
    ledger.observe("frame-0","doc-2","c2","new",replacement,true);
    assertNull(ledger.route(ledger.captureId(),"frame-a"));
    ledger.disconnect(old);
    assertSame(replacement,ledger.top().port);
  }
  @Test public void unchangedHeartbeatPreservesAggregateCaptureButMutationInvalidatesIt() {
    GeckoFrameLedger<String,Object> ledger=new GeckoFrameLedger<>(); Object port=new Object();
    ledger.observe("frame-0","doc","c1","root",port,true); String id=ledger.captureId();
    ledger.observe("frame-0","doc","c1","root",port,true); assertEquals(id,ledger.captureId());
    ledger.observe("frame-0","doc","c2","changed",port,true); assertNull(ledger.route(id,"frame-0"));
  }
}
