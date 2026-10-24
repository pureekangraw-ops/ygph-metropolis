import test from "node:test";
import assert from "node:assert/strict";
import {publicSiteHost,ownerSitePermissions,mayGoUseSite,sitePermissionsView,
  updateOwnerSitePermission,MAX_OWNER_SITES} from "../site-permissions.mjs";

const defaults="*.yggmetro.com,greenhouse-owner.pages.dev";
const page="https://www.google.com/search?q=map";

test("public hosts are exact, not parent domains or private endpoints",()=>{
  assert.equal(publicSiteHost(page),"www.google.com");
  for(const u of ["http://www.google.com/","https://localhost/","https://10.0.0.1/",
    "https://evil.google.com:443/","https://user:secret@www.google.com/",
    "https://google.com.evil.invalid/","https://foo.internal/","https://example.com:8080/"])
    assert.equal(publicSiteHost(u),null,u);
});

test("new websites require explicit owner allowance and distinct session invitation",()=>{
  let s={url:page,controller:"BIG",mode:"OBSERVE",allowGoRead:false,grantedHost:null,
    sitePermissions:[]};
  assert.equal(mayGoUseSite(page,defaults,s.sitePermissions),false);
  assert.equal(sitePermissionsView(s,defaults).canInviteGo,false);
  updateOwnerSitePermission(s,"allow","www.google.com");
  assert.equal(mayGoUseSite(page,defaults,s.sitePermissions),true);
  assert.equal(mayGoUseSite("https://google.com/",defaults,s.sitePermissions),false);
  assert.equal(mayGoUseSite("https://accounts.google.com/",defaults,s.sitePermissions),false);
  assert.equal(mayGoUseSite("https://www.google.com.evil.org/",defaults,s.sitePermissions),false);
  assert.equal(sitePermissionsView(s,defaults).sessionGranted,false);
  assert.equal(mayGoUseSite("https://shop.yggmetro.com/",defaults,s.sitePermissions),true);
  assert.throws(()=>updateOwnerSitePermission(s,"allow","accounts.google.com"),/CURRENT_SITE_ONLY/);
});

test("revoking current host clears read/control and interrupts a pending GO job",()=>{
  const s={url:page,controller:"GO",mode:"HEADLESS",status:"RUNNING",allowGoRead:true,
    grantedHost:"www.google.com",sitePermissions:["www.google.com"],
    job:{status:"RUNNING"}};
  updateOwnerSitePermission(s,"revoke","www.google.com");
  assert.equal(s.controller,"BIG");assert.equal(s.grantedHost,null);
  assert.equal(s.allowGoRead,false);
  assert.equal(s.job.status,"STOP_REQUESTED");
  assert.equal(s.status,"STOP_REQUESTED");
});

test("permissions cannot be injected with wildcards or arbitrary URL strings",()=>{
  const s={url:page,sitePermissions:[]};
  for(const host of ["*.google.com","google.com/path","localhost","1.1.1.1","foo..org",
    "google.com:443","GOOGLE.COM","-bad.org"])
    assert.throws(()=>updateOwnerSitePermission(s,"allow",host),host);
  for(let i=0;i<MAX_OWNER_SITES;i++){
    s.url="https://site"+i+".good.org/";
    updateOwnerSitePermission(s,"allow","site"+i+".good.org");
  }
  s.url="https://overflow.good.org/";
  assert.throws(()=>updateOwnerSitePermission(s,"allow","overflow.good.org"),/OWNER_SITE_LIMIT/);
  assert.equal(ownerSitePermissions(s.sitePermissions).length,MAX_OWNER_SITES);
});
