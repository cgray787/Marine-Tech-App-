#!/usr/bin/env node
// Fix the ASC submission blockers that ARE API-doable: copyright + content rights.

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

async function patchVersionCopyright() {
  const versions = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=10`);
  const pending = versions.data.find(
    (v) =>
      v.attributes.platform === "IOS" &&
      v.attributes.appStoreState === "PREPARE_FOR_SUBMISSION"
  );
  await api(`/v1/appStoreVersions/${pending.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appStoreVersions",
        id: pending.id,
        attributes: { copyright: "2026 Gray Yachts LLC" },
      },
    }),
  });
  console.log(`✓ copyright set: 2026 Gray Yachts LLC`);
}

async function patchContentRights() {
  const infos = await api(`/v1/apps/${APP_ID}/appInfos`);
  const editable =
    infos.data.find((i) => i.attributes.state === "PREPARE_FOR_SUBMISSION") ??
    infos.data[0];
  // Try contentRightsDeclaration values: DOES_NOT_USE_THIRD_PARTY_CONTENT or USES_THIRD_PARTY_CONTENT
  await api(`/v1/apps/${APP_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "apps",
        id: APP_ID,
        attributes: {
          contentRightsDeclaration: "DOES_NOT_USE_THIRD_PARTY_CONTENT",
        },
      },
    }),
  });
  console.log(`✓ content rights: does not use third-party content`);
}

async function main() {
  await patchVersionCopyright();
  await patchContentRights();
  console.log("\n✓ done.");
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
