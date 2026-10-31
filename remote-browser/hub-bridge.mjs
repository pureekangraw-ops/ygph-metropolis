import {allowedAction,cleanStep} from "./policy.mjs";
import {verifyHubAccessAssertion} from "./hub-auth.mjs";
import {computeHubRequestDigest,encodeHubContext} from "./hub-contract.mjs";

const ROUTES=Object.freeze({
  observatory_session:{method:"GET",path:"/v1/session",keys:[]},
  observatory_observe:{method:"GET",path:"/v1/observe",keys:[]},
  observatory_screenshot:{method:"GET",path:"/v1/screenshot",keys:[]},
  observatory_action:{method:"POST",path:"/v1/action",
    keys:["type","url","selector","value","y"]},
  observatory_run:{method:"POST",path:"/v1/run",keys:["steps","requestId"]},
  observatory_job:{method:"GET",path:"/v1/job",keys:[]},
  observatory_note:{method:"POST",path:"/v1/note",keys:["message"]}
});
export const supportedHubTools=Object.freeze(Object.keys(ROUTES));
const uuid=/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/u;
const sessionId=/^[A-Za-z0-9_-]{1,256}$/u;

function cleanArguments(name,args) {
  const route=ROUTES[name];
  if(!route)return {error:"UNSUPPORTED_OBSERVATORY_TOOL"};
  if(!args||typeof args!=="object"||Array.isArray(args)||
     Object.keys(args).some(key=>!route.keys.includes(key)))return {error:"INVALID_TOOL_ARGUMENTS"};
  if(name==="observatory_action") {
    if(!allowedAction(args))return {error:"ACTION_NOT_ALLOWED"};
    return {route,args:cleanStep(args)};
  }
  if(name==="observatory_run") {
    if(!uuid.test(args.requestId||"")||!Array.isArray(args.steps)||
        args.steps.length<1||args.steps.length>10||!args.steps.every(allowedAction))
      return {error:"INVALID_GO_PLAN"};
    return {route,args:{requestId:args.requestId,steps:args.steps.map(cleanStep)}};
  }
  if(name==="observatory_note"&&(
      typeof args.message!=="string"||args.message.trim().length<1||args.message.length>240))
    return {error:"INVALID_GO_NOTE"};
  return {route,args};
}

function cleanContext(context,name) {
  const allowed=["accessJwt","browserSessionId","grantId","requestId"];
  if(!context||typeof context!=="object"||Array.isArray(context)||
      Object.keys(context).some(key=>!allowed.includes(key))||
      typeof context.accessJwt!=="string"||context.accessJwt.length<1||
      context.accessJwt.length>16384||!uuid.test(context.requestId||""))
    return {error:"INVALID_HUB_CONTEXT"};
  const hasSession=typeof context.browserSessionId==="string"&&sessionId.test(context.browserSessionId);
  const hasGrant=typeof context.grantId==="string"&&uuid.test(context.grantId);
  if((context.browserSessionId!==undefined&&!hasSession)||
      (context.grantId!==undefined&&!hasGrant)||hasSession!==hasGrant)
    return {error:"INVALID_HUB_SELECTORS"};
  if(name!=="observatory_session"&&!hasGrant)
    return {error:"OWNER_INVITATION_REQUIRED"};
  return {
    accessJwt:context.accessJwt,
    browserSessionId:hasSession?context.browserSessionId:null,
    grantId:hasGrant?context.grantId:null,
    requestId:context.requestId,
  };
}

function fail(status,error,extra={}) {
  return {ok:false,status,...(error?{error}:{}),...extra};
}

export async function invokeObservatoryHub(env,name,args={},context={},fetcher=fetch) {
  const validation=cleanArguments(name,args);
  if(validation.error)return fail("INVALID_ARGUMENTS",validation.error);
  const supplied=cleanContext(context,name);
  if(supplied.error)return fail("INVALID_CONTEXT",supplied.error);
  if(!env?.SESSIONS||typeof env.SESSIONS.idFromName!=="function")
    return fail("BROWSER_BINDING_NOT_CONFIGURED");
  const identity=await verifyHubAccessAssertion(supplied.accessJwt,env,fetcher);
  if(!identity)return fail("HUB_ASSERTION_INVALID");

  const trusted={
    name,issuer:identity.issuer,audience:identity.audience,subject:identity.subject,
    issuedAt:identity.issuedAt,expiresAt:identity.expiresAt,
    browserSessionId:supplied.browserSessionId,grantId:supplied.grantId,
    requestId:supplied.requestId,
  };
  trusted.digest=await computeHubRequestDigest(trusted,validation.args);
  const {method,path}=validation.route;
  try {
    const stub=env.SESSIONS.get(env.SESSIONS.idFromName("owner-browser-v1"));
    const request=new Request(`https://observatory-internal.invalid${path}`,{
      method,headers:{
        "x-observatory-role":"HUB",
        "x-observatory-hub-context":encodeHubContext(trusted),
        "content-type":"application/json",
      },
      ...(method==="POST"?{body:JSON.stringify(validation.args)}:{})
    });
    const response=await stub.fetch(request);
    const text=await response.text();
    if(text.length>1000000)return fail("RESPONSE_TOO_LARGE");
    let parsed;
    try{parsed=JSON.parse(text);}catch{return fail("INVALID_UPSTREAM_RESPONSE");}
    if(!response.ok||parsed?.error||parsed?.status==="OWNER_INVITATION_REQUIRED") {
      const status=String(parsed?.status||parsed?.error||"OWNER_ACCESS_DENIED_OR_UPSTREAM_ERROR").slice(0,80);
      const safe={};
      if(typeof parsed?.invitationRequestId==="string")safe.invitationRequestId=parsed.invitationRequestId;
      if(typeof parsed?.error==="string")safe.error=parsed.error.slice(0,120);
      return fail(status,undefined,safe);
    }
    return {ok:true,status:"CONNECTED",result:parsed};
  }catch{
    return fail("OBSERVATORY_UNAVAILABLE");
  }
}