#!/usr/bin/env node
// Add a TestFlight tester to the JBY-Marine Tech beta group.
// Idempotent: if the tester already exists, just adds them to the group.
//
// Usage: node scripts/asc-add-tester.mjs <email> <firstName> [lastName]

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";
const BETA_GROUP_ID = "c1c8b688-5b65-4d39-9808-7b6845456aee"; // "Jby- Marine Tech Tester"

const [, , email, firstName, lastName] = process.argv;
if (!email || !firstName) {
  console.error("usage: node scripts/asc-add-tester.mjs <email> <firstName> [lastName]");
  process.exit(1);
}

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

async function findExistingTester() {
  // Walk the beta group's testers; ASC doesn't expose a flat tester search.
  const groupTesters = await api(
    `/v1/betaGroups/${BETA_GROUP_ID}/betaTesters?fields[betaTesters]=email&limit=200`
  );
  return groupTesters.data.find(
    (t) => (t.attributes.email ?? "").toLowerCase() === email.toLowerCase()
  );
}

async function main() {
  const existing = await findExistingTester();
  if (existing) {
    console.log(`✓ tester already in group: ${existing.id} (${email})`);
    return;
  }

  // Create the beta tester linked to the beta group + app.
  const created = await api(`/v1/betaTesters`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaTesters",
        attributes: {
          email,
          firstName,
          lastName: lastName ?? "",
        },
        relationships: {
          betaGroups: {
            data: [{ type: "betaGroups", id: BETA_GROUP_ID }],
          },
        },
      },
    }),
  });
  console.log(`✓ tester created: ${created.data.id}`);
  console.log(`  Apple will email an invite to ${email} from noreply@email.apple.com.`);
  console.log(`  They install TestFlight on iOS, accept the invite, and install build 23.`);
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
