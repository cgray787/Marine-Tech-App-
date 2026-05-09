import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";
const SUBMISSION_ID = "3ff95be0-98a6-4535-a3aa-a47847596697";
const OLD_SUBMISSION_ID = "17108359-e147-4bf3-aade-8fa9f639cf2c";
const KEY_PATH = "/Users/connorgray/Desktop/Claude OS/marine-tech-app/mobile/.secrets/AuthKey_2B5Z869244.p8";
const privateKey = readFileSync(KEY_PATH, "utf8");

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
const jwt = makeJwt();
async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status} on ${method} ${path}`); console.error(text); process.exit(1); }
  return text ? JSON.parse(text) : null;
}

// Get the old submission's item id
const oldItems = await api("GET", `/v1/reviewSubmissions/${OLD_SUBMISSION_ID}/items`);
console.log(`Old submission has ${oldItems.data.length} item(s)`);
for (const it of oldItems.data) console.log(`  item id=${it.id} state=${it.attributes.state}`);

// Try DELETE on each
for (const it of oldItems.data) {
  console.log(`\nDELETE /v1/reviewSubmissionItems/${it.id}`);
  await api("DELETE", `/v1/reviewSubmissionItems/${it.id}`);
  console.log(`  ✅ deleted`);
}

// Now resolve current state
const versions = await api("GET", `/v1/apps/${APP_ID}/appStoreVersions?limit=1&fields[appStoreVersions]=versionString`);
const versionId = versions.data[0].id;
console.log(`\nv1.0 id = ${versionId}`);

// Add v1.0 to new submission
console.log(`\n[2/3] Adding v1.0 to submission ${SUBMISSION_ID}...`);
const item = await api("POST", `/v1/reviewSubmissionItems`, {
  data: {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: SUBMISSION_ID } },
      appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
    },
  },
});
console.log(`  ✅ item id=${item.data.id}`);

// Submit
console.log(`\n[3/3] Submitting ${SUBMISSION_ID}...`);
await api("PATCH", `/v1/reviewSubmissions/${SUBMISSION_ID}`, {
  data: { type: "reviewSubmissions", id: SUBMISSION_ID, attributes: { submitted: true } },
});
console.log(`  ✅ submitted`);

const verify = await api("GET", `/v1/reviewSubmissions/${SUBMISSION_ID}?fields[reviewSubmissions]=state,submittedDate`);
console.log(`\nFinal state: ${verify.data.attributes.state}  submittedDate=${verify.data.attributes.submittedDate}`);
