#!/usr/bin/env node
// Reposition the App Store listing for public distribution per Guideline 3.2:
//   - Update App Review notes (no longer "internal-only")
//   - Update the public-facing description + keywords + promotional text
//   - Update demo creds explanation
//
// Run from /mobile:  node scripts/asc-reposition-public.mjs

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

// 1. Find the current iOS app store version (REJECTED → still editable)
const versions = await api(
  `/v1/apps/${APP_ID}/appStoreVersions?fields[appStoreVersions]=versionString,appStoreState,platform&limit=10`
);
const v = versions.data.find(
  (x) => x.attributes.platform === "IOS" && x.attributes.appStoreState !== "READY_FOR_SALE"
);
if (!v) {
  console.error("No editable iOS version found");
  process.exit(1);
}
console.log(`✓ editing version ${v.attributes.versionString} (${v.attributes.appStoreState})`);

// 2. Update review details (notes + demo creds explanation)
const reviewDetailRes = await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`);
const reviewDetailId = reviewDetailRes.data.id;

const newNotes = `Marine Tech is a service-management app for marine mechanics and boat owners. The app is free for any user — anyone can create an account directly in the app via the "Create a free account" link on the sign-in screen.

ACCOUNT TYPES (chosen by the user during signup):
1. Marine Mechanic — track your customer boats, schedule jobs, and complete service / pre-delivery inspection (PDI) reports with photos.
2. Boat Owner — maintain a personal service log for your own boats.

FREE TIER LIMITS:
Free accounts include up to 3 customers and 25 service reports. There is no paid tier in the app at this time; users who exceed the free tier are directed to contact support.

WHO CAN USE IT:
Anyone — independent marine technicians, multi-tech shops, and boat owners. There is no restriction on company affiliation, geography, or invitation. The app supports an optional invite-link flow that lets a shop owner provision technician accounts for their team, but this is alongside (not instead of) public signup.

HOW TO TEST AS A NEW USER:
1. From the sign-in screen, tap "Create a free account".
2. Pick "Marine Mechanic" or "Boat Owner".
3. Enter any email + password (no email verification required for testing).
4. You will land in the app with an empty workspace — tap "Add Client" on the Clients tab to add your first customer + boat, then go to the Service tab to file a checklist-based service report (Engine / Electrical / Hull / Safety / Nav). The Calendar tab shows scheduled jobs; the PDI tab files pre-delivery inspections.

DEMO ACCOUNT (optional, includes seeded data):
demoAccountName: appreview@grayyachts.com
demoAccountPassword: <set APP_REVIEW_PASSWORD>
This account is a 'shop' tier user with one seeded customer ("Demo Customer (App Review)") and boat ("Sea Trial") and an assigned job for tomorrow at 9 AM, so reviewers can immediately see populated data without going through the new-user flow.

CAMERA / PHOTO LIBRARY: Used to photograph boat conditions, HIN plates, and engine hours during inspections, and to attach existing photos to reports.

Questions during review: connorgray41@gmail.com.`;

await api(`/v1/appStoreReviewDetails/${reviewDetailId}`, {
  method: "PATCH",
  body: JSON.stringify({
    data: {
      type: "appStoreReviewDetails",
      id: reviewDetailId,
      attributes: {
        contactFirstName: "Connor",
        contactLastName: "Gray",
        contactPhone: "+1 206 555 0100",
        contactEmail: "connorgray41@gmail.com",
        demoAccountName: "appreview@grayyachts.com",
        demoAccountPassword: process.env.APP_REVIEW_PASSWORD ?? "",
        demoAccountRequired: false, // anyone can sign up — demo is optional
        notes: newNotes,
      },
    },
  }),
});
console.log("✓ updated reviewer notes");

// 3. Update the en-US localization (description + promo text + keywords)
const locs = await api(
  `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,description,keywords,promotionalText&limit=10`
);
const enUS = locs.data.find((x) => x.attributes.locale === "en-US");
if (!enUS) {
  console.error("en-US localization not found");
  process.exit(1);
}

const newDescription = `Marine Tech is a free service-management app for marine mechanics and boat owners.

For Marine Mechanics:
• Track customer boats with full vessel details (HIN, engine, color, marina)
• Schedule jobs with date, time, and location on a built-in calendar
• Run BAD/GOOD checklists across Engine, Electrical, Hull, Safety, and Navigation systems
• Capture inspection photos — HIN plates, engine hours, before/after, damage
• File pre-delivery inspection (PDI) reports for new boats
• Export and share completed reports as PDF

For Boat Owners:
• Maintain a personal service log for each of your boats
• Photograph and date-stamp every service event
• Build a complete maintenance history that travels with the boat

Designed by marine technicians for the way work actually happens at the dock — offline-capable, photo-first, and tab-based so you can move from Clients to Service to Calendar without losing your place.

Free Account
Up to 3 customers and 25 service reports are included free. Power users with bigger fleets should contact support to discuss higher limits.

Built with privacy in mind. Camera and photo library access are used only to attach photos to reports you create. We never share your data.`;

const newPromo = "Photo-first service reports, BAD/GOOD checklists across 5 vessel systems, scheduling calendar, and a complete maintenance log. Free for marine mechanics and boat owners.";

const newKeywords = "marine,boat,service,maintenance,mechanic,inspection,PDI,checklist,marina,yacht,sailboat,outboard";

await api(`/v1/appStoreVersionLocalizations/${enUS.id}`, {
  method: "PATCH",
  body: JSON.stringify({
    data: {
      type: "appStoreVersionLocalizations",
      id: enUS.id,
      attributes: {
        description: newDescription,
        keywords: newKeywords,
        promotionalText: newPromo,
      },
    },
  }),
});
console.log("✓ updated en-US description, promotional text, keywords");

console.log("\nNext steps:");
console.log("  1. (manual) Reply to Apple in Resolution Center — see scripts/RESOLUTION_REPLY.md");
console.log("  2. Build 25:  cd mobile && npx eas-cli build --platform ios --profile production");
console.log("  3. Submit:    npx eas-cli submit --platform ios --latest");
console.log("  4. After submission completes:  node scripts/asc-attach-build-and-categories.mjs");
console.log("  5. Resubmit for review: node scripts/asc-submit-for-review.mjs");
