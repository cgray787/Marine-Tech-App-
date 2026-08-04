#!/usr/bin/env node
// Finalize what's API-doable on App Store Connect:
//   1. Age Rating Declaration — all fields NONE/false → 4+
//   2. App Review Info — demo creds, contact, notes
//
// NOT done by this script (Apple keeps these UI-only):
//   - App Privacy "nutrition label" (Privacy Details endpoints don't exist)
//   - Pricing & Availability (set in the UI; 30 seconds)

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";

const REVIEW_NOTES = `Marine Tech is an internal field-service app for marine technicians at JBY Yachts (Jeff Brown Yachts). Tech accounts are invite-only and provisioned by the shop owner, so the demo credentials below are required for review.

Main flow to verify:
1. Sign in with the demo credentials.
2. Clients tab — see the seeded "Demo Customer (App Review)" + "Sea Trial" boat.
3. Service tab — start a service report; Engine / Electrical / Hull / Safety / Nav checklists. Camera is used to photograph HIN plates and engine hours on inspection photos.
4. Calendar tab — month view with the seeded job assigned for tomorrow at 9 AM.
5. PDI tab — pre-delivery inspection checklist.

Camera access: photograph boat conditions, HIN plates, and engine hours.
Photo Library access: attach existing photos to reports and save inspection photos.

Questions during review: connorgray41@gmail.com.`;

const REVIEW_DETAILS = {
  contactFirstName: "Connor",
  contactLastName: "Gray",
  contactPhone: "+1 206 555 0100", // placeholder — update in ASC with real number
  contactEmail: "connorgray41@gmail.com",
  demoAccountName: "appreview@grayyachts.com",
  // Read from the environment — a working password for a live tech account has
  // no business in source control. Export APP_REVIEW_PASSWORD before running.
  demoAccountPassword: process.env.APP_REVIEW_PASSWORD ?? "",
  demoAccountRequired: true,
  notes: REVIEW_NOTES,
};

// Age rating → 4+. Apple's API has shifted some fields from frequency-strings
// to booleans; we default to "no/not present" everywhere. Frequency strings
// remain for content-classification fields.
const AGE_RATING = {
  // Boolean: yes/no presence
  advertising: false,
  gambling: false,
  healthOrWellnessTopics: false,
  lootBox: false,
  messagingAndChat: false,
  parentalControls: false,
  unrestrictedWebAccess: false,
  userGeneratedContent: false,

  // Frequency strings: NONE / INFREQUENT_OR_MILD / FREQUENT_OR_INTENSE
  alcoholTobaccoOrDrugUseOrReferences: "NONE",
  contests: "NONE",
  gamblingSimulated: "NONE",
  gunsOrOtherWeapons: "NONE",
  medicalOrTreatmentInformation: "NONE",
  profanityOrCrudeHumor: "NONE",
  sexualContentGraphicAndNudity: "NONE",
  sexualContentOrNudity: "NONE",
  horrorOrFearThemes: "NONE",
  matureOrSuggestiveThemes: "NONE",
  violenceCartoonOrFantasy: "NONE",
  violenceRealisticProlongedGraphicOrSadistic: "NONE",
  violenceRealistic: "NONE",

  // ageRatingOverride (legacy v1) and ageRatingOverrideV2 are mutually
  // exclusive. Use V2 only.
  ageRatingOverrideV2: "NONE",
  koreaAgeRatingOverride: "NONE",
  ageAssurance: false,
};

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
    throw new Error(`api ${path}`);
  }
  return text ? JSON.parse(text) : {};
}

async function setAgeRating() {
  const infos = await api(`/v1/apps/${APP_ID}/appInfos`);
  const editable =
    infos.data.find((i) => i.attributes.state === "PREPARE_FOR_SUBMISSION") ?? infos.data[0];
  const decl = await api(`/v1/appInfos/${editable.id}/ageRatingDeclaration`);
  const declId = decl.data.id;
  await api(`/v1/ageRatingDeclarations/${declId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: { type: "ageRatingDeclarations", id: declId, attributes: AGE_RATING },
    }),
  });
  console.log(`✓ age rating set → 4+ (${declId})`);
}

async function getPendingVersion() {
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
  if (!pending) throw new Error("No pending version");
  return pending;
}

async function setReviewDetails() {
  const version = await getPendingVersion();
  const existing = await api(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
  if (existing.data) {
    await api(`/v1/appStoreReviewDetails/${existing.data.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "appStoreReviewDetails",
          id: existing.data.id,
          attributes: REVIEW_DETAILS,
        },
      }),
    });
    console.log(`✓ review details updated (${existing.data.id})`);
  } else {
    const created = await api(`/v1/appStoreReviewDetails`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "appStoreReviewDetails",
          attributes: REVIEW_DETAILS,
          relationships: {
            appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
          },
        },
      }),
    });
    console.log(`✓ review details created (${created.data.id})`);
  }
}

async function main() {
  await setAgeRating();
  await setReviewDetails();
  console.log("\n✓ done. Still need MANUAL clicks in App Store Connect for:");
  console.log("   • Pricing & Availability (set price → Free, territories → All)");
  console.log("   • App Privacy 'nutrition label' (data collection answers)");
  console.log("   • Update contactPhone — placeholder is +1-555-0100");
  console.log("   • Click 'Add for Review' → 'Submit'");
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
