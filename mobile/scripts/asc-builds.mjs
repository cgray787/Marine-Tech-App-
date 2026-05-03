#!/usr/bin/env node
// Quick ASC API check: list latest builds + processing state for the app.
// Reads private key from mobile/.secrets/AuthKey_<KEY_ID>.p8

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", ".secrets", `AuthKey_${KEY_ID}.p8`);
const privateKey = readFileSync(keyPath, "utf8");

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJwt() {
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 60 * 15, aud: "appstoreconnect-v1" };
  const headerEnc = b64url(JSON.stringify(header));
  const payloadEnc = b64url(JSON.stringify(payload));
  const signer = createSign("SHA256");
  signer.update(`${headerEnc}.${payloadEnc}`);
  const sig = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${headerEnc}.${payloadEnc}.${b64url(sig)}`;
}

const jwt = makeJwt();

async function api(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status} on ${path}`);
    console.error(await res.text());
    process.exit(1);
  }
  return res.json();
}

const builds = await api(
  `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=5&fields[builds]=version,uploadedDate,expired,processingState`
);

console.log(`\nLatest builds for app ${APP_ID}:`);
for (const b of builds.data) {
  const a = b.attributes;
  const flag = a.processingState === "VALID" ? "✅" : a.processingState === "PROCESSING" ? "⏳" : "❌";
  console.log(`  ${flag} build ${a.version}  state=${a.processingState}  uploaded=${a.uploadedDate}`);
}

const groups = await api(
  `/v1/apps/${APP_ID}/betaGroups?fields[betaGroups]=name,isInternalGroup,publicLink,publicLinkEnabled&limit=20`
);
console.log(`\nBeta groups (${groups.data.length}):`);
for (const g of groups.data) {
  const a = g.attributes;
  console.log(
    `  - ${a.name}  internal=${a.isInternalGroup}  publicLink=${a.publicLinkEnabled ? a.publicLink : "off"}  id=${g.id}`
  );
}

// Per-group: list testers + which builds the group can install
for (const g of groups.data) {
  const groupTesters = await api(
    `/v1/betaGroups/${g.id}/betaTesters?fields[betaTesters]=email,firstName,lastName,inviteType&limit=20`
  );
  console.log(`\nTesters in "${g.attributes.name}" (${groupTesters.data.length}):`);
  for (const t of groupTesters.data) {
    const a = t.attributes;
    console.log(`  - ${a.email ?? "(no email)"}  ${a.firstName ?? ""} ${a.lastName ?? ""}  inviteType=${a.inviteType}`);
  }

  const groupBuilds = await api(
    `/v1/betaGroups/${g.id}/builds?fields[builds]=version,uploadedDate,processingState&limit=200`
  );
  const sorted = groupBuilds.data
    .map((b) => b.attributes)
    .sort((a, b) => (a.uploadedDate < b.uploadedDate ? 1 : -1))
    .slice(0, 5);
  console.log(`Builds available to "${g.attributes.name}" (top 5 of ${groupBuilds.data.length}):`);
  for (const a of sorted) {
    console.log(`  - build ${a.version}  state=${a.processingState}  uploaded=${a.uploadedDate}`);
  }
}
console.log("");
