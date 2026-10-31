import test from "node:test";
import assert from "node:assert/strict";
import {verifyHubAccessAssertion,clearHubAccessJwksCache} from "../hub-auth.mjs";
import {accessConfig,signedAccessToken,corruptSignature} from "./hub-fixtures.mjs";

test("Cloudflare Access assertion verifies issuer, audience and signed subject",async()=>{
  clearHubAccessJwksCache();
  const {token,fetcher}=await signedAccessToken();
  const identity=await verifyHubAccessAssertion(token,accessConfig,fetcher);
  assert.equal(identity.issuer,`https://${accessConfig.CF_ACCESS_TEAM_DOMAIN}`);
  assert.equal(identity.audience,accessConfig.CF_ACCESS_AUD);
  assert.equal(identity.subject,"hub-user-001");
  assert.ok(identity.expiresAt>identity.issuedAt);
});

test("tampered signatures and wrong issuer or audience fail closed",async()=>{
  clearHubAccessJwksCache();
  const {token,fetcher}=await signedAccessToken();
  assert.equal(await verifyHubAccessAssertion(corruptSignature(token),accessConfig,fetcher),null);
  const wrongIssuer=await signedAccessToken({iss:"https://attacker.cloudflareaccess.com"});
  assert.equal(await verifyHubAccessAssertion(wrongIssuer.token,accessConfig,wrongIssuer.fetcher),null);
  const wrongAudience=await signedAccessToken({aud:["wrong-audience"]});
  assert.equal(await verifyHubAccessAssertion(wrongAudience.token,accessConfig,wrongAudience.fetcher),null);
});

test("expired and incomplete Access assertions fail closed",async()=>{
  clearHubAccessJwksCache();
  const now=Math.floor(Date.now()/1000);
  const expired=await signedAccessToken({exp:now-1});
  assert.equal(await verifyHubAccessAssertion(expired.token,accessConfig,expired.fetcher),null);
  const missingSubject=await signedAccessToken({sub:""});
  assert.equal(await verifyHubAccessAssertion(missingSubject.token,accessConfig,missingSubject.fetcher),null);
  const missingIat=await signedAccessToken({iat:"bad"});
  assert.equal(await verifyHubAccessAssertion(missingIat.token,accessConfig,missingIat.fetcher),null);
});

test("issuer config is pinned and never taken from token input",async()=>{
  clearHubAccessJwksCache();
  const {token,fetcher}=await signedAccessToken();
  assert.equal(await verifyHubAccessAssertion(token,{...accessConfig,CF_ACCESS_TEAM_DOMAIN:"evil.example"},fetcher),null);
  assert.equal(await verifyHubAccessAssertion(token,{CF_ACCESS_AUD:accessConfig.CF_ACCESS_AUD},fetcher),null);
});