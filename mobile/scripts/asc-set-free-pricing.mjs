import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
const KEY_ID="2B5Z869244"; const ISSUER_ID="f3b47a16-d70b-4ef4-bc3b-e30fed4d2766"; const APP_ID="6762853683";
const privateKey = readFileSync(".secrets/AuthKey_2B5Z869244.p8", "utf8");
function b64url(b){return Buffer.from(b).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
function makeJwt(){const h={alg:"ES256",kid:KEY_ID,typ:"JWT"};const n=Math.floor(Date.now()/1000);const p={iss:ISSUER_ID,iat:n,exp:n+1200,aud:"appstoreconnect-v1"};const he=b64url(JSON.stringify(h));const pe=b64url(JSON.stringify(p));const s=createSign("SHA256");s.update(`${he}.${pe}`);return `${he}.${pe}.${b64url(s.sign({key:privateKey,dsaEncoding:"ieee-p1363"}))}`;}
const jwt=makeJwt();
async function api(path, init={}){const r=await fetch(`https://api.appstoreconnect.apple.com${path}`,{...init,headers:{Authorization:`Bearer ${jwt}`,"Content-Type":"application/json",...(init.headers??{})}});return {status:r.status, body:await r.text()};}

const freeUsaPriceId = "eyJzIjoiNjc2Mjg1MzY4MyIsInQiOiJVU0EiLCJwIjoiMTAwMDAifQ";

// Create priceSchedule with embedded manualPrices using the included resources pattern
const create = await api(`/v1/appPriceSchedules`, {
  method: "POST",
  body: JSON.stringify({
    data: {
      type: "appPriceSchedules",
      relationships: {
        app: { data: { type: "apps", id: APP_ID } },
        baseTerritory: { data: { type: "territories", id: "USA" } },
        manualPrices: { data: [{ type: "appPrices", id: "${free-usa}" }] },
      },
    },
    included: [
      {
        type: "appPrices",
        id: "${free-usa}",
        attributes: {
          startDate: null, // means "now / immediately"
        },
        relationships: {
          appPricePoint: { data: { type: "appPricePoints", id: freeUsaPriceId } },
          territory: { data: { type: "territories", id: "USA" } },
        },
      },
    ],
  }),
});
console.log("POST status:", create.status);
console.log(create.body.slice(0, 1200));
