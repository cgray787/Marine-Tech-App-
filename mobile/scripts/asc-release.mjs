// One-shot release driver: create (or reuse) an appStoreVersion, attach a
// processed build, set whatsNew, and submit for App Review.
//
// Usage: node asc-release.mjs <versionString> <buildNumber> [stage]
//   e.g. node asc-release.mjs 1.2.0 36        — full flow incl. submit
//        node asc-release.mjs 1.2.0 36 stage  — stop before submitting for review
//
// Handles the known post-attach 409 STATE_ERROR ("Version is not ready yet")
// by retrying the final submit step for up to ~10 minutes.

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";
const KEY_PATH = join(dirname(fileURLToPath(import.meta.url)), "../.secrets/AuthKey_2B5Z869244.p8");
const privateKey = readFileSync(KEY_PATH, "utf8");

const [versionString, buildNumber, mode] = process.argv.slice(2);
if (!versionString || !buildNumber) {
  console.error("Usage: node asc-release.mjs <versionString> <buildNumber>");
  process.exit(1);
}

const WHATS_NEW = `• Sign in with Apple or Google
• New Day view on the Calendar tab with an hour-by-hour schedule
• Create jobs directly from the calendar
• Multi-day job scheduling and per-service descriptions
• Bug fixes and performance improvements`;

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
function makeJwt() {
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 60 * 15, aud: "appstoreconnect-v1" };
  const headerEnc = b64url(JSON.stringify(header));
  const payloadEnc = b64url(JSON.stringify(payload));
  const signer = createSign("SHA256");
  signer.update(`${headerEnc}.${payloadEnc}`);
  return `${headerEnc}.${payloadEnc}.${b64url(signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }))}`;
}

async function api(method, path, body, { allowError = false } = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${makeJwt()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok && !allowError) {
    console.error(`HTTP ${res.status} on ${method} ${path}`);
    console.error(text);
    process.exit(1);
  }
  return { status: res.status, json };
}

// 1. Find or create the appStoreVersion
let versionId;
const existing = await api(
  "GET",
  `/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${versionString}&filter[platform]=IOS`
);
if (existing.json.data.length > 0) {
  versionId = existing.json.data[0].id;
  console.log(`Version ${versionString} already exists (${existing.json.data[0].attributes.appStoreState}) — reusing ${versionId}`);
} else {
  const created = await api("POST", "/v1/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: { platform: "IOS", versionString, releaseType: "AFTER_APPROVAL" },
      relationships: { app: { data: { type: "apps", id: APP_ID } } },
    },
  });
  versionId = created.json.data.id;
  console.log(`Created appStoreVersion ${versionString} → ${versionId}`);
}

// 2. Find the processed build by build number
const builds = await api(
  "GET",
  `/v1/builds?filter[app]=${APP_ID}&filter[version]=${buildNumber}&filter[processingState]=VALID`
);
if (builds.json.data.length === 0) {
  console.error(`No VALID build with number ${buildNumber} found`);
  process.exit(1);
}
const buildId = builds.json.data[0].id;
console.log(`Build ${buildNumber} → ${buildId}`);

// 3. Attach the build to the version
await api("PATCH", `/v1/appStoreVersions/${versionId}/relationships/build`, {
  data: { type: "builds", id: buildId },
});
console.log("Build attached");

// 4. Set whatsNew on the en-US localization
const locs = await api("GET", `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
const enUs = locs.json.data.find((l) => l.attributes.locale === "en-US") ?? locs.json.data[0];
if (!enUs) {
  console.error("No version localization found");
  process.exit(1);
}
await api("PATCH", `/v1/appStoreVersionLocalizations/${enUs.id}`, {
  data: { type: "appStoreVersionLocalizations", id: enUs.id, attributes: { whatsNew: WHATS_NEW } },
});
console.log(`whatsNew set on ${enUs.attributes.locale}`);

if (mode === "stage") {
  console.log("STAGED — version created, build attached, whatsNew set. Run without 'stage' to submit for review.");
  process.exit(0);
}

// 5. Create review submission + add the version + submit, retrying past the
//    transient post-attach 409 STATE_ERROR.
let submissionId;
const existingSub = await api(
  "GET",
  `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES`,
  null,
  { allowError: true }
);
const openSub = existingSub.json?.data?.find((s) => s.attributes.state === "READY_FOR_REVIEW");
if (openSub) {
  submissionId = openSub.id;
  console.log(`Reusing open draft reviewSubmission ${submissionId}`);
} else {
  const sub = await api("POST", "/v1/reviewSubmissions", {
    data: {
      type: "reviewSubmissions",
      attributes: { platform: "IOS" },
      relationships: { app: { data: { type: "apps", id: APP_ID } } },
    },
  });
  submissionId = sub.json.data.id;
  console.log(`Created reviewSubmission ${submissionId}`);
}

const item = await api(
  "POST",
  "/v1/reviewSubmissionItems",
  {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
        appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
      },
    },
  },
  { allowError: true }
);
if (item.status >= 400) {
  const code = item.json?.errors?.[0]?.code ?? "";
  if (String(code).includes("ENTITY_ERROR.RELATIONSHIP.INVALID")) {
    console.log("Version already in the submission — continuing");
  } else {
    console.error(`Adding item failed (HTTP ${item.status}):`, JSON.stringify(item.json?.errors));
    process.exit(1);
  }
} else {
  console.log("Version added to submission");
}

for (let attempt = 1; attempt <= 20; attempt++) {
  const submit = await api(
    "PATCH",
    `/v1/reviewSubmissions/${submissionId}`,
    { data: { type: "reviewSubmissions", id: submissionId, attributes: { submitted: true } } },
    { allowError: true }
  );
  if (submit.status < 400) {
    console.log(`SUBMITTED for review (state=${submit.json.data.attributes.state})`);
    process.exit(0);
  }
  const detail = submit.json?.errors?.[0]?.detail ?? "";
  console.log(`Attempt ${attempt}: HTTP ${submit.status} — ${detail.slice(0, 120)}`);
  if (submit.status !== 409) process.exit(1);
  await new Promise((r) => setTimeout(r, 30_000));
}
console.error("Gave up after 20 submit attempts");
process.exit(1);
