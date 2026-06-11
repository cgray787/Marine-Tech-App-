#!/usr/bin/env node
// Submit a Marine Tech App Store version for review via the App Store Connect API.
// Assumes the build has already been uploaded (e.g. via `eas submit`).
// Steps: find the uploaded build → wait until VALID → create/find appStoreVersion
// → attach build → set "What's New" → submit for review.
// Usage: node scripts/asc-submit.mjs <versionString> <buildNumber> "<whats new>"

import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = "2B5Z869244";
const ISSUER = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";
const KEY_PATH = new URL("../mobile/.secrets/AuthKey_2B5Z869244.p8", import.meta.url);

const VERSION = process.argv[2] || "1.1.0";
const BUILD_NUMBER = process.argv[3] || "34";
const WHATS_NEW =
  process.argv[4] ||
  "You can now add and remove clients right from the app. Plus behind-the-scenes improvements to support multiple locations.";

const key = fs.readFileSync(KEY_PATH, "utf8");
function b64url(b) { return Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function jwt() {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }));
  const s = crypto.createSign("SHA256");
  s.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(s.sign({ key, dsaEncoding: "ieee-p1363" }))}`;
}
async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findValidBuild() {
  for (let i = 0; i < 40; i++) {
    const r = await api("GET", `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=20`);
    const b = (r.json.data || []).find((x) => x.attributes?.version === BUILD_NUMBER);
    if (b) {
      const st = b.attributes.processingState;
      console.log(`build ${BUILD_NUMBER}: ${st}`);
      if (st === "VALID") return b.id;
      if (st === "FAILED" || st === "INVALID") throw new Error(`build processing ${st}`);
    } else {
      console.log(`build ${BUILD_NUMBER} not visible yet (attempt ${i + 1})`);
    }
    await sleep(60000);
  }
  throw new Error("timed out waiting for build to become VALID");
}

async function getOrCreateVersion() {
  const r = await api("GET", `/v1/apps/${APP_ID}/appStoreVersions?limit=10`);
  const existing = (r.json.data || []).find((v) => v.attributes.versionString === VERSION);
  if (existing) { console.log(`reusing version ${VERSION} (${existing.attributes.appStoreState})`); return existing.id; }
  const c = await api("POST", "/v1/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: { platform: "IOS", versionString: VERSION },
      relationships: { app: { data: { type: "apps", id: APP_ID } } },
    },
  });
  if (c.status >= 300) throw new Error(`create version failed ${c.status}: ${JSON.stringify(c.json.errors)}`);
  console.log(`created version ${VERSION}`);
  return c.json.data.id;
}

async function setWhatsNew(versionId) {
  const r = await api("GET", `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  const loc = (r.json.data || []).find((l) => l.attributes.locale === "en-US") || r.json.data?.[0];
  if (!loc) { console.log("no localization found; skipping whatsNew"); return; }
  const u = await api("PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
    data: { type: "appStoreVersionLocalizations", id: loc.id, attributes: { whatsNew: WHATS_NEW } },
  });
  console.log(`whatsNew set (${u.status})`);
}

async function main() {
  const buildId = await findValidBuild();
  const versionId = await getOrCreateVersion();
  const attach = await api("PATCH", `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: "builds", id: buildId },
  });
  console.log(`attach build (${attach.status})`);
  await setWhatsNew(versionId);

  // find an existing READY_FOR_REVIEW submission or create one
  const subs = await api("GET", `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[state]=READY_FOR_REVIEW&limit=1`);
  let subId = subs.json.data?.[0]?.id;
  if (!subId) {
    const c = await api("POST", "/v1/reviewSubmissions", {
      data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: { data: { type: "apps", id: APP_ID } } } },
    });
    if (c.status >= 300) throw new Error(`create submission failed ${c.status}: ${JSON.stringify(c.json.errors)}`);
    subId = c.json.data.id;
  }
  console.log(`review submission ${subId}`);

  const item = await api("POST", "/v1/reviewSubmissionItems", {
    data: { type: "reviewSubmissionItems", relationships: { reviewSubmission: { data: { type: "reviewSubmissions", id: subId } }, appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } } },
  });
  console.log(`attach version to submission (${item.status}) ${item.status >= 300 ? JSON.stringify(item.json.errors) : ""}`);

  const submit = await api("PATCH", `/v1/reviewSubmissions/${subId}`, {
    data: { type: "reviewSubmissions", id: subId, attributes: { submitted: true } },
  });
  if (submit.status >= 300) throw new Error(`submit failed ${submit.status}: ${JSON.stringify(submit.json.errors)}`);
  console.log(`SUBMITTED FOR REVIEW — version ${VERSION} (build ${BUILD_NUMBER}). State: ${submit.json.data?.attributes?.state}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
