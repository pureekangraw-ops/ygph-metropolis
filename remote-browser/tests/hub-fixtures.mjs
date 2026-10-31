import {webcrypto} from "node:crypto";

const enc=new TextEncoder();
const b64url=bytes=>Buffer.from(bytes).toString("base64url");
const keysPromise=webcrypto.subtle.generateKey({
  name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256",
},true,["sign","verify"]);

export const accessConfig={
  CF_ACCESS_TEAM_DOMAIN:"pureekangraw.cloudflareaccess.com",
  CF_ACCESS_AUD:"b58f59d8d951e2205bbaa1ee4ca4b4cfafee8c1ab054176f99f1a5e40d5ce395",
};

export async function signedAccessToken(overrides={}) {
  const {publicKey,privateKey}=await keysPromise;
  const jwk=await webcrypto.subtle.exportKey("jwk",publicKey);
  Object.assign(jwk,{kid:"observatory-test-kid",alg:"RS256",use:"sig"});
  const now=Math.floor(Date.now()/1000);
  const header=b64url(enc.encode(JSON.stringify({
    alg:"RS256",typ:"JWT",kid:"observatory-test-kid",
  })));
  const claims=b64url(enc.encode(JSON.stringify({
    iss:`https://${accessConfig.CF_ACCESS_TEAM_DOMAIN}`,
    aud:[accessConfig.CF_ACCESS_AUD],sub:"hub-user-001",
    iat:now,exp:now+3600,...overrides,
  })));
  const input=`${header}.${claims}`;
  const signature=await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",privateKey,enc.encode(input),
  );
  const token=`${input}.${b64url(new Uint8Array(signature))}`;
  const fetcher=async url=>{
    if(url!==`https://${accessConfig.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)
      throw new Error("Unexpected JWKS URL");
    return Response.json({keys:[jwk]});
  };
  return {token,jwk,fetcher,publicKey,privateKey};
}

export function corruptSignature(token) {
  const parts=token.split(".");
  parts[2]=`${parts[2].slice(0,-2)}aa`;
  return parts.join(".");
}