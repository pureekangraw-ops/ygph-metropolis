import test from "node:test";
import assert from "node:assert/strict";
import { scrollRemotePage } from "../scroll.mjs";
import { allowedAction } from "../policy.mjs";

test("remote scroll uses actual wheel at center of viewport", async()=>{
  const calls=[];
  const page={
    viewport:()=>({width:1024,height:768}),
    mouse:{
      move:async(x,y)=>calls.push(["move",x,y]),
      wheel:async(args)=>calls.push(["wheel",args.deltaY])
    }
  };
  await scrollRemotePage(page,480);
  assert.deepEqual(calls,[["move",512,384],["wheel",480]]);
});
test("missing viewport still scrolls; only valid bounded deltas pass upstream policy",async()=>{
  const calls=[];
  const page={viewport:()=>null,mouse:{move:async()=>{throw Error("unexpected move");},
    wheel:async(args)=>calls.push(args.deltaY)}};
  await scrollRemotePage(page,-350);
  assert.deepEqual(calls,[-350]);
  assert.equal(allowedAction({type:"scroll",y:1800}),true);
  assert.equal(allowedAction({type:"scroll",y:-1800}),true);
  assert.equal(allowedAction({type:"scroll",y:1801}),false);
});
