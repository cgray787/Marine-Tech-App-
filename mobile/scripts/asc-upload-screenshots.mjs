#!/usr/bin/env node
// Upload iPhone 6.9" screenshots to App Store Connect for the pending version.
// Usage: node scripts/asc-upload-screenshots.mjs <dir>

import { readFileSync, statSync, readdirSync } from "node:fs";
import { createSign, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, extname } from "node:path";

const KEY_ID = "2B5Z869244";
const ISSUER_ID = "f3b47a16-d70b-4ef4-bc3b-e30fed4d2766";
const APP_ID = "6762853683";
const LOCALE = "en-US";

// CLI: <dir> [<screenshotType>]
// screenshotType defaults to APP_IPHONE_67. Common values:
//   APP_IPHONE_67           — iPhone 6.7"/6.9" displays (1290×2796 / 1320×2868)
//   APP_IPAD_PRO_3GEN_129   — iPad Pro 12.9"/13" (2064×2752)
//   APP_IPAD_PRO_3GEN_11    — iPad Pro 11"      (1640×2360)
const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", ".secrets", `AuthKey_${KEY_ID}.p8`);
const privateKey = readFileSync(keyPath, "utf8");
const dirArg = process.argv[2];
const SCREENSHOT_TYPE = process.argv[3] ?? "APP_IPHONE_67";
if (!dirArg) {
  console.error("usage: node scripts/asc-upload-screenshots.mjs <dir> [<screenshotType>]");
  process.exit(1);
}

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

async function getOrCreatePendingVersion() {
  const versions = await api(
    `/v1/apps/${APP_ID}/appStoreVersions?fields[appStoreVersions]=versionString,appStoreState,platform&limit=10`
  );
  let pending = versions.data.find(
    (v) =>
      v.attributes.platform === "IOS" &&
      [
        "PREPARE_FOR_SUBMISSION",
        "DEVELOPER_REJECTED",
        "REJECTED",
        "METADATA_REJECTED",
        "WAITING_FOR_REVIEW",
        "INVALID_BINARY",
        "DEVELOPER_REMOVED_FROM_SALE",
      ].includes(v.attributes.appStoreState)
  );
  if (pending) {
    console.log(`✓ pending version ${pending.attributes.versionString} (${pending.attributes.appStoreState})`);
    return pending.id;
  }
  console.log("Creating new appStoreVersion 1.0.0…");
  const created = await api(`/v1/appStoreVersions`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersions",
        attributes: { platform: "IOS", versionString: "1.0.0" },
        relationships: { app: { data: { type: "apps", id: APP_ID } } },
      },
    }),
  });
  console.log(`✓ version created: ${created.data.id}`);
  return created.data.id;
}

async function getOrCreateLocalization(versionId) {
  const list = await api(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale&limit=50`
  );
  const existing = list.data.find((l) => l.attributes.locale === LOCALE);
  if (existing) {
    console.log(`✓ localization ${LOCALE}: ${existing.id}`);
    return existing.id;
  }
  console.log(`Creating ${LOCALE} localization…`);
  const created = await api(`/v1/appStoreVersionLocalizations`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionLocalizations",
        attributes: { locale: LOCALE },
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } },
      },
    }),
  });
  return created.data.id;
}

async function getOrCreateScreenshotSet(localizationId) {
  const list = await api(
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=50`
  );
  const existing = list.data.find((s) => s.attributes.screenshotDisplayType === SCREENSHOT_TYPE);
  if (existing) {
    console.log(`✓ screenshot set ${SCREENSHOT_TYPE}: ${existing.id}`);
    // Wipe existing screenshots so we don't pile up
    const old = await api(`/v1/appScreenshotSets/${existing.id}/appScreenshots?limit=50`);
    for (const s of old.data) {
      console.log(`  removing old screenshot ${s.id}`);
      await api(`/v1/appScreenshots/${s.id}`, { method: "DELETE" });
    }
    return existing.id;
  }
  console.log(`Creating ${SCREENSHOT_TYPE} screenshot set…`);
  const created = await api(`/v1/appScreenshotSets`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: SCREENSHOT_TYPE },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: localizationId },
          },
        },
      },
    }),
  });
  return created.data.id;
}

async function uploadOne(setId, filePath) {
  const fileName = basename(filePath);
  const buf = readFileSync(filePath);
  const fileSize = buf.length;
  console.log(`\n→ ${fileName} (${fileSize} bytes)`);

  const reservation = await api(`/v1/appScreenshots`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appScreenshots",
        attributes: { fileSize, fileName },
        relationships: {
          appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } },
        },
      },
    }),
  });
  const id = reservation.data.id;
  const ops = reservation.data.attributes.uploadOperations ?? [];
  console.log(`  reserved id=${id}, ${ops.length} upload op(s)`);

  for (const op of ops) {
    const headers = {};
    for (const h of op.requestHeaders ?? []) headers[h.name] = h.value;
    const slice = buf.subarray(op.offset, op.offset + op.length);
    const res = await fetch(op.url, { method: op.method, headers, body: slice });
    if (!res.ok) {
      console.error(`upload op failed ${res.status}: ${await res.text()}`);
      process.exit(1);
    }
    console.log(`  ✓ uploaded ${op.length} bytes @ ${op.offset}`);
  }

  const md5 = createHash("md5").update(buf).digest("hex");
  await api(`/v1/appScreenshots/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appScreenshots",
        id,
        attributes: { uploaded: true, sourceFileChecksum: md5 },
      },
    }),
  });
  console.log(`  ✓ committed ${fileName}`);
}

async function main() {
  const files = readdirSync(dirArg)
    .filter((f) => extname(f).toLowerCase() === ".png")
    .sort()
    .map((f) => join(dirArg, f));
  console.log(`Uploading ${files.length} screenshots from ${dirArg}\n`);

  const versionId = await getOrCreatePendingVersion();
  const localizationId = await getOrCreateLocalization(versionId);
  const setId = await getOrCreateScreenshotSet(localizationId);

  for (const f of files) {
    statSync(f);
    await uploadOne(setId, f);
  }

  console.log("\n✓ done. View in App Store Connect → 1.0.0 Prepare for Submission → iPhone 6.9″ Display.");
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
