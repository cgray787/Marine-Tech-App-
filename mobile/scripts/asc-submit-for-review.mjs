#!/usr/bin/env node
// Submit the pending appStoreVersion to App Review via the ASC API.
//
// Three-step flow Apple requires:
//   1. POST /v1/reviewSubmissions          — create a draft submission
//   2. POST /v1/reviewSubmissionItems      — add the appStoreVersion to it
//   3. PATCH /v1/reviewSubmissions/{id}    — set submitted=true
//
// IRREVERSIBLE in the sense that the version goes into Apple's review queue.
// You can withdraw before it's APPROVED but you can't undo the submission act.

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";

const __dirname = dirname(fileURLToPath(import.meta.url));
const privateKey = readFileSync(
  join(__dirname, "..", ".secrets", `AuthKey_${KEY_ID}.p8`),
  "utf8"
);

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function makeJwt() {
  const h = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const p = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" };
  const he = b64url(JSON.stringify(h));
  const pe = b64url(JSON.stringify(p));
  const s = createSign("SHA256");
  s.update(`${he}.${pe}`);
  return `${he}.${pe}.${b64url(s.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }))}`;
}
const jwt = makeJwt();

async function api(path, init = {}) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  if (!r.ok) {
    console.error(`HTTP ${r.status} ${path}\n${text}`);
    throw new Error(path);
  }
  return text ? JSON.parse(text) : {};
}

// Step 0: get pending appStoreVersion
const versions = await api(
  `/v1/apps/${APP_ID}/appStoreVersions?fields[appStoreVersions]=versionString,appStoreState,platform&limit=10`
);
const pending = versions.data.find(
  (v) =>
    v.attributes.platform === "IOS" &&
    [
      "PREPARE_FOR_SUBMISSION",
      "DEVELOPER_REJECTED",
      "REJECTED",
      "METADATA_REJECTED",
      "INVALID_BINARY",
    ].includes(v.attributes.appStoreState)
);
if (!pending) {
  console.error("No pending iOS version to submit.");
  process.exit(1);
}
console.log(`Submitting v${pending.attributes.versionString} (${pending.id})…`);

// Step 1: check if a draft submission already exists for this app/platform
const existingSubs = await api(
  `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES,COMPLETING&limit=10`
);
let submission = existingSubs.data.find((s) =>
  ["READY_FOR_REVIEW", "UNRESOLVED_ISSUES"].includes(s.attributes.state)
);

if (!submission) {
  // Create a new draft submission
  const created = await api(`/v1/reviewSubmissions`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissions",
        attributes: { platform: "IOS" },
        relationships: { app: { data: { type: "apps", id: APP_ID } } },
      },
    }),
  });
  submission = created.data;
  console.log(`✓ created reviewSubmission ${submission.id}`);
} else {
  console.log(`✓ existing reviewSubmission ${submission.id} (${submission.attributes.state})`);
}

// Step 2: ensure the version is in the submission as an item
const items = await api(
  `/v1/reviewSubmissions/${submission.id}/items?fields[reviewSubmissionItems]=state&limit=10`
);
const hasItem = items.data.length > 0;
if (!hasItem) {
  await api(`/v1/reviewSubmissionItems`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
          appStoreVersion: { data: { type: "appStoreVersions", id: pending.id } },
        },
      },
    }),
  });
  console.log(`✓ added v${pending.attributes.versionString} to submission`);
} else {
  console.log(`✓ submission already has ${items.data.length} item(s)`);
}

// Step 3: flip submitted=true to send to Apple
const submitted = await api(`/v1/reviewSubmissions/${submission.id}`, {
  method: "PATCH",
  body: JSON.stringify({
    data: {
      type: "reviewSubmissions",
      id: submission.id,
      attributes: { submitted: true },
    },
  }),
});
console.log(`\n🚀 Submitted to App Review.`);
console.log(`   submission state: ${submitted.data.attributes.state}`);
console.log(`   typical review time: 24–48 hr (you'll get email updates)`);
console.log(`   track at: https://appstoreconnect.apple.com/apps/${APP_ID}/distribution/ios`);
