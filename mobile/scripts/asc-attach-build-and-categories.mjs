#!/usr/bin/env node
// Attach the latest VALID build to the pending appStoreVersion + set categories.

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";

// Apple category IDs (from /v1/appCategories)
const PRIMARY_CATEGORY_ID = "BUSINESS";
const SECONDARY_CATEGORY_ID = "PRODUCTIVITY";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", ".secrets", `AuthKey_${KEY_ID}.p8`);
const privateKey = readFileSync(keyPath, "utf8");

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function makeJwt() {
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 60 * 20, aud: "appstoreconnect-v1" };
  const headerEnc = b64url(JSON.stringify(header));
  const payloadEnc = b64url(JSON.stringify(payload));
  const signer = createSign("SHA256");
  signer.update(`${headerEnc}.${payloadEnc}`);
  const sig = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${headerEnc}.${payloadEnc}.${b64url(sig)}`;
}
const jwt = makeJwt();

async function api(path, init = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${path}\n${text}`);
    process.exit(1);
  }
  return text ? JSON.parse(text) : {};
}

async function getLatestValidBuild() {
  const builds = await api(
    `/v1/builds?filter[app]=${APP_ID}&filter[processingState]=VALID&sort=-uploadedDate&limit=5&fields[builds]=version,uploadedDate,processingState,expired`
  );
  const fresh = builds.data.filter((b) => !b.attributes.expired);
  if (!fresh.length) throw new Error("No VALID builds found");
  return fresh[0];
}

async function getPendingVersion() {
  const versions = await api(
    `/v1/apps/${APP_ID}/appStoreVersions?fields[appStoreVersions]=versionString,appStoreState,platform&include=build&limit=10`
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
  if (!pending) throw new Error("No editable pending version");
  return pending;
}

async function attachBuild() {
  const version = await getPendingVersion();
  const build = await getLatestValidBuild();
  console.log(
    `Attaching build ${build.attributes.version} (${build.id}) to version ${version.attributes.versionString}…`
  );
  await api(`/v1/appStoreVersions/${version.id}/relationships/build`, {
    method: "PATCH",
    body: JSON.stringify({ data: { type: "builds", id: build.id } }),
  });
  console.log(`✓ build ${build.attributes.version} attached`);
}

async function setCategories() {
  const infos = await api(`/v1/apps/${APP_ID}/appInfos?limit=10`);
  const editable = infos.data.find(
    (i) => i.attributes.state === "PREPARE_FOR_SUBMISSION"
  ) ?? infos.data[0];
  console.log(`Setting categories on appInfo ${editable.id}…`);
  await api(`/v1/appInfos/${editable.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appInfos",
        id: editable.id,
        relationships: {
          primaryCategory: {
            data: { type: "appCategories", id: PRIMARY_CATEGORY_ID },
          },
          secondaryCategory: {
            data: { type: "appCategories", id: SECONDARY_CATEGORY_ID },
          },
        },
      },
    }),
  });
  console.log(`✓ primary=Business, secondary=Productivity`);
}

async function main() {
  await attachBuild();
  await setCategories();
  console.log("\n✓ done.");
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
