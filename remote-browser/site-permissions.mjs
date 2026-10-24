import {validPageUrl, mayGoAct} from "./policy.mjs";

// Owner-controlled, exact-host permissions. No wildcard, subdomains, IPs or private URLs.
export const MAX_OWNER_SITES=32;
export function publicSiteHost(url) {
  const safe=validPageUrl(url);
  if(!safe)return null;
  const host=new URL(safe).hostname.toLowerCase();
  if(host.length>253 || !host.includes(".") || host.endsWith(".") ||
     !/^[a-z0-9.-]+$/.test(host) || host.split(".").some(label=>
       label.length<1 || label.length>63 || label.startsWith("-") || label.endsWith("-")))
    return null;
  return host;
}
export function ownerSitePermissions(value) {
  if(!Array.isArray(value))return [];
  return [...new Set(value.filter(h=>typeof h==="string"&&
    publicSiteHost("https://"+h)===h))].slice(0,MAX_OWNER_SITES);
}
export function mayGoUseSite(url,defaultHosts,extraSites) {
  const host=publicSiteHost(url);
  return !!host && (mayGoAct(url,defaultHosts) || ownerSitePermissions(extraSites).includes(host));
}
export function sitePermissionsView(state,defaultHosts) {
  const host=publicSiteHost(state.url);
  const sites=ownerSitePermissions(state.sitePermissions);
  return {pageHost:host,canInviteGo:!!host&&mayGoUseSite(state.url,defaultHosts,sites),
    ownerGranted:!!host&&sites.includes(host),defaultGranted:!!host&&mayGoAct(state.url,defaultHosts),
    approvedSites:sites, sessionGranted:!!host&&state.allowGoRead===true&&state.grantedHost===host};
}
export function updateOwnerSitePermission(state,action,host) {
  if(!["allow","revoke"].includes(action) || typeof host!=="string" ||
     publicSiteHost("https://"+host)!==host)throw Error("INVALID_SITE_PERMISSION");
  const sites=ownerSitePermissions(state.sitePermissions);
  if(action==="allow"){
    if(host!==publicSiteHost(state.url))throw Error("PERMISSION_CURRENT_SITE_ONLY");
    if(!sites.includes(host)&&sites.length>=MAX_OWNER_SITES)throw Error("OWNER_SITE_LIMIT");
    state.sitePermissions=[...new Set([...sites,host])];
  } else {
    if(!sites.includes(host))throw Error("SITE_PERMISSION_NOT_FOUND");
    state.sitePermissions=sites.filter(x=>x!==host);
    // A revoked host cannot retain any session invitation or control.
    if(state.grantedHost===host){
      state.allowGoRead=false;state.grantedHost=null;
      state.controller="BIG";state.mode="OBSERVE";
      if(state.job?.status==="RUNNING"){state.status="STOP_REQUESTED";state.job.status="STOP_REQUESTED";}
    }
  }
  return state;
}
