#!/usr/bin/env node
// Retry the final "submit for review" on an already-staged reviewSubmission.
// ASC often returns 409 "Version is not ready to be submitted yet" right after a
// build is attached; this polls until it accepts. Usage: node scripts/asc-resubmit.mjs

import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = "2B5Z869244";
const ISSUER = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";
const KEY_PATH = new URL("../mobile/.secrets/AuthKey_2B5Z869244.p8", import.meta.url);
const key = fs.readFileSync(KEY_PATH, "utf8");

function b64url(b) { return Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function jwt() {
  const h = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const p = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }));
  const s = crypto.createSign("SHA256"); s.update(`${h}.${p}`);
  return `${h}.${p}.${b64url(s.sign({ key, dsaEncoding: "ieee-p1363" }))}`;
}
async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  return { status: res.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // find the open READY_FOR_REVIEW submission for this app
  const subs = await api("GET", `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[state]=READY_FOR_REVIEW&limit=1`);
  const subId = subs.json.data?.[0]?.id;
  if (!subId) { console.log("No READY_FOR_REVIEW submission found — may already be submitted. Checking...");
    const all = await api("GET", `/v1/reviewSubmissions?filter[app]=${APP_ID}&limit=3`);
    for (const s of (all.json.data||[])) console.log(`  submission ${s.id.slice(0,8)} state=${s.attributes.state}`);
    return;
  }
  console.log(`retrying submit on ${subId}`);
  for (let i = 0; i < 15; i++) {
    const r = await api("PATCH", `/v1/reviewSubmissions/${subId}`, {
      data: { type: "reviewSubmissions", id: subId, attributes: { submitted: true } },
    });
    if (r.status < 300) { console.log(`SUBMITTED FOR REVIEW. State: ${r.json.data?.attributes?.state}`); return; }
    const msg = JSON.stringify(r.json.errors || r.json);
    console.log(`attempt ${i + 1}: ${r.status} — ${msg.slice(0, 140)}`);
    if (!msg.includes("not ready") && !msg.includes("STATE_ERROR")) { throw new Error(`non-retryable: ${msg}`); }
    await sleep(90000);
  }
  throw new Error("timed out retrying submit");
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
