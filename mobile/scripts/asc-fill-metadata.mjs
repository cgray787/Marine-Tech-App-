#!/usr/bin/env node
// Fill App Store Connect listing metadata for the pending version + app info.
// Idempotent: PATCH-only, runs the same regardless of prior state.

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";
const LOCALE = "en-US";

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

const VERSION_LOCALIZATION = {
  description: `Marine Tech is the field service app for marine technicians — built by a yacht brokerage for the people who actually maintain boats.

Run a boat service job from start to finish without paper. Pull up your assigned work for the day, document the vessel, capture engine hours and HIN plates, and submit a clean report before you leave the dock.

KEY FEATURES

• Daily job list — see every job assigned to you, grouped by customer, with a clear status at a glance
• Calendar view — month grid for the big picture, weekly panel showing scheduled vs. unscheduled jobs, long-press any job to drop it on the calendar
• Service reports — structured checklists across Engine, Electrical, Hull, Safety, and Navigation, with BAD / GOOD assessments and per-item notes
• Pre-Delivery Inspections — full PDI checklist with progress tracking
• Photo capture — camera and library access for HIN plates, engine hours, before / after, and damage shots, attached directly to each report
• Customer & boat directory — add customers and boats from the field; supplier dropdown for parts sourcing
• Offline-first — keep working with no signal; the app queues edits and uploads when you're back online
• Owner dashboard — admins on the web see every report, every photo, and the whole calendar

Marine Tech is invite-only — your shop owner provisions your account so your reports go to the right place. Login required.

Designed for iPhone and iPad.`,
  keywords:
    "marine,boat,yacht,inspection,service,technician,PDI,checklist,fleet,maintenance,marina,survey",
  marketingUrl: "https://grayyachts.com/marine-tech",
  supportUrl: "https://grayyachts.com/marine-tech/support",
  promotionalText:
    "Document boat service jobs, run pre-delivery inspections, capture photos, and sync your day from the dock — built for marine technicians.",
  // whatsNew omitted — only valid for non-initial releases
};

const APP_INFO_LOCALIZATION = {
  name: "JBY-Marine Tech",
  subtitle: "Marine service & PDI reports",
  privacyPolicyUrl: "https://grayyachts.com/marine-tech/privacy",
};

async function patchVersionLocalization() {
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
    console.log("No pending version to update — skipping version metadata.");
    return;
  }
  const localizations = await api(
    `/v1/appStoreVersions/${pending.id}/appStoreVersionLocalizations?limit=50`
  );
  const loc = localizations.data.find((l) => l.attributes.locale === LOCALE);
  if (!loc) {
    console.log(`No ${LOCALE} version localization — skipping.`);
    return;
  }
  await api(`/v1/appStoreVersionLocalizations/${loc.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionLocalizations",
        id: loc.id,
        attributes: VERSION_LOCALIZATION,
      },
    }),
  });
  console.log(`✓ version localization updated (${loc.id})`);
}

async function patchAppInfoLocalization() {
  const infos = await api(`/v1/apps/${APP_ID}/appInfos?limit=10`);
  // Pick the editable one — has 'appStoreState' READY_FOR_REVIEW or PREPARE_FOR_SUBMISSION
  const editable = infos.data.find((i) =>
    ["READY_FOR_DISTRIBUTION", "PREPARE_FOR_SUBMISSION"].includes(i.attributes.appStoreAgeRatingState)
      ? false
      : true
  );
  // Apple returns 1-2; the editable one is in PREPARE_FOR_SUBMISSION state
  const editableInfo = infos.data.find(
    (i) => i.attributes.state === "PREPARE_FOR_SUBMISSION"
  ) ?? infos.data[0];
  console.log(`Using appInfo ${editableInfo.id} state=${editableInfo.attributes.state}`);

  const locs = await api(
    `/v1/appInfos/${editableInfo.id}/appInfoLocalizations?limit=50`
  );
  const loc = locs.data.find((l) => l.attributes.locale === LOCALE);
  if (!loc) {
    console.log(`No ${LOCALE} appInfo localization — skipping.`);
    return;
  }
  await api(`/v1/appInfoLocalizations/${loc.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appInfoLocalizations",
        id: loc.id,
        attributes: APP_INFO_LOCALIZATION,
      },
    }),
  });
  console.log(`✓ app info localization updated (${loc.id})`);
}

async function main() {
  await patchVersionLocalization();
  await patchAppInfoLocalization();
  console.log("\n✓ done. Refresh App Store Connect to see the metadata.");
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
