// Host-only cross-runtime fixture: synthetic credentials/storage, loopback listener only.
import http from 'node:http';
import Worker from '../worker.mjs';
import {invokeGoview} from '../go-adapter.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const actualGo=process.env.GOVIEW_GO_ADAPTER
 ?(await import(pathToFileURL(resolve(process.env.GOVIEW_GO_ADAPTER)))).goviewDirect:null;
if(process.env.GOVIEW_REQUIRE_ACTUAL_GO==='true'&&typeof actualGo!=='function')throw Error('ACTUAL_GO_REQUIRED');
const objects=new Map();
const env={GO_WRITE_TOKEN:'G'.repeat(32),ANDROID_READ_TOKEN:'R'.repeat(32),ANDROID_UPLOAD_TOKEN:'U'.repeat(32),PACKAGES:{
 get:async key=>objects.has(key)?{size:Buffer.byteLength(objects.get(key)),text:async()=>objects.get(key),httpEtag:'synthetic',etag:'synthetic'}:null,
 put:async(key,value,options)=>{if(options?.onlyIf?.etagDoesNotMatch==='*'&&objects.has(key))return null;if(options?.onlyIf?.etagMatches&&(!objects.has(key)||options.onlyIf.etagMatches!=='synthetic'))return null;objects.set(key,String(value));return {};}
}};
const server=http.createServer(async(req,res)=>{
 try {
  const chunks=[];let length=0;for await(const part of req){length+=part.length;if(length>2200000)throw Error('limit');chunks.push(part);}
  const body=Buffer.concat(chunks).toString('utf8');
  if(req.url==='/synthetic-fixture/health'){
   res.setHeader('content-type','application/json');return res.end(JSON.stringify({synthetic:true,actualGo:typeof actualGo==='function',objects:objects.size}));
  }
  if(req.url.startsWith('/synthetic-go/')){
   if(req.headers.authorization!=='Bearer '+env.GO_WRITE_TOKEN){res.writeHead(403);return res.end();}
   const name=req.url.slice('/synthetic-go/'.length),args=JSON.parse(body);
   const result=actualGo?await actualGo({GOVIEW_GO:{invoke:(tool,input)=>invokeGoview(env,tool,input)}},name,args):await invokeGoview(env,name,args);
   res.setHeader('content-type','application/json');return res.end(JSON.stringify(result));
  }
  const result=await Worker.fetch(new Request('https://synthetic.invalid'+req.url,{method:req.method,headers:req.headers,...(body?{body}:{})}),env);
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
 }catch{res.writeHead(500);res.end('{"error":"SYNTHETIC_FIXTURE_FAILURE"}');}
});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
