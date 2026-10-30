import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as policy from '../policy.mjs';
import * as sites from '../site-permissions.mjs';
import * as webauthn from '@simplewebauthn/server';
import * as passkeyUtils from '../passkey-utils.mjs';
const source=readFileSync(new URL('../worker.mjs',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replace('export default {','const worker = {').replaceAll('export class ','class ');
function fixture({tag='BUTTON',type='button',text='Open details',form=false,role='',method='get',action='/search',search=false,parent=false,formMethod='',formAction='',value=''}={}) {
 const events=[];
 const formElement=form?{method,role,getAttribute:key=>key==='role'?role:key==='method'?method:key==='action'?action:null,querySelector:selector=>search?{}:null,action:'https://example.com'+action}:null;
 const control={tagName:tag,type,innerText:text,value,formMethod,formAction:formAction?'https://example.com'+formAction:'',isContentEditable:false,
  getAttribute:key=>key==='type'?type:key==='formmethod'?formMethod:key==='formaction'?formAction:null,closest:selector=>selector==='form'?formElement:control};
 const element=parent?{innerText:'',getAttribute:()=>null,closest:selector=>selector==='form'?formElement:control,isContentEditable:false}:control;
 const state={browserSessionId:'test',targetId:'target',controller:'GO',mode:'LIVE',allowGoRead:true,grantedHost:'example.com',url:'https://example.com/'};
 const page={target:()=>({_targetId:'target'}),url:()=>state.url,$eval:async(selector,callback)=>callback(element),click:async()=>events.push('click')};
 const deps={puppeteer:{connect:async()=>({pages:async()=>[page],disconnect:async()=>{}})},...policy,...sites,webauthn,passkeyUtils,WorkerEntrypoint:class {}};
 const Workspace=new Function(...Object.keys(deps),source+';return BrowserWorkspace;')(...Object.values(deps));
 const instance=new Workspace({storage:{get:async()=>structuredClone(state),put:async(k,v)=>Object.assign(state,v)}},{GO_ALLOWED_HOSTS:'example.com'});
 return {events,click:selector=>instance.action(state,{type:'click',selector},'GO')};
}
test('search submit selectors reach DOM classification while sensitive selectors stay blocked',()=>{
 assert.equal(policy.allowedAction({type:'click',selector:'#search-submit'}),true);
 assert.equal(policy.allowedAction({type:'click',selector:'button[type=submit]'}),true);
 for(const selector of ['.payment','.payButton','#deleteRecord','#tokenizer-help'])
  assert.equal(policy.allowedAction({type:'click',selector}),false,selector);
});
for(const options of [
 {tag:'INPUT',type:'text',form:true,text:'',value:'transfer learning'},
 {tag:'BUTTON',type:'button',form:true},
 {tag:'A',type:'',form:true,text:'Display options'},
 {tag:'BUTTON',type:'submit',text:'Search',form:true,role:'search'},
 {tag:'INPUT',type:'submit',text:'Google Search',form:true,search:true},
 {tag:'BUTTON',type:'submit',text:'Search',form:true,role:'search',parent:true}
])test('ordinary form interaction '+JSON.stringify(options),async()=>{
 const f=fixture(options);await f.click('button[type=submit]');assert.deepEqual(f.events,['click']);
});
for(const options of [
 {type:'submit',form:true,text:'Save changes',action:'/account'},
 {type:'submit',form:true,text:'Search',role:'search',method:'post'},
 {type:'submit',form:true,text:'Confirm payment',role:'search'},
 {type:'button',form:true,text:'Delete record'},
 {type:'submit',form:true,text:'Send',parent:true},
 {tag:'INPUT',type:'password',text:''},
 {type:'submit',text:'Search',form:true,role:'search',formMethod:'post'},
 {type:'button',text:'Submit application',form:true},
 {type:'submit',text:'Search',form:true,role:'search',formAction:'/purchase'},
 {type:'submit',text:'Search',form:true,role:'search',action:'/delete'}
])test('important action remains owner-only '+JSON.stringify(options),async()=>{
 const f=fixture(options);await assert.rejects(f.click('#generic'),/SENSITIVE_ACTION_NEEDS_OWNER/);assert.deepEqual(f.events,[]);
});
