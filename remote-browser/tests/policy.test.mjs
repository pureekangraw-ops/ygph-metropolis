import test from "node:test";
import assert from "node:assert/strict";
import { validPageUrl, mayGoAct, allowedAction, cleanStep } from "../policy.mjs";
test("public HTTPS only and no userinfo/private hosts",()=>{
  assert.equal(validPageUrl("https://shop.yggmetro.com/"),"https://shop.yggmetro.com/");
  for(const url of ["http://shop.yggmetro.com","https://localhost/","https://127.0.0.1/","https://10.1.1.1/","https://user:pass@shop.yggmetro.com/","file:///etc/passwd","https://[::1]/"]) assert.equal(validPageUrl(url),null,url);
});
test("GO can act on only explicitly allowed hosts",()=>{
  assert.equal(mayGoAct("https://office.yggmetro.com/admin","*.yggmetro.com"),true);
  assert.equal(mayGoAct("https://evil-yggmetro.com","*.yggmetro.com"),false);
  assert.equal(mayGoAct("https://example.org","*.yggmetro.com"),false);
});
test("no arbitrary JavaScript or dangerous elements",()=>{
  assert.ok(allowedAction({type:"navigate",url:"https://shop.yggmetro.com/"}));
  assert.ok(allowedAction({type:"scroll",y:400}));
  assert.ok(allowedAction({type:"click",selector:"button.check-status"}));
  for(const action of [{type:"js",value:"alert(1)"},{type:"click",selector:"button.checkout"},{type:"type",selector:"input[type=password]",value:"s"},{type:"scroll",y:1e12}]) assert.equal(allowedAction(action),false);
  assert.equal(cleanStep({type:"reload"}).type,"reload");
});
