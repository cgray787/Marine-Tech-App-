---
name: ios-release
description: Ship a Marine Tech iOS build - EAS production build, TestFlight/App Store submission via the App Store Connect API, OTA updates, and the credential/agreement gotchas that block them. Use when building, submitting, or updating the mobile app, or when an ASC call returns 403 or a submit 409s.
---

# iOS release - Marine Tech

- **Apple Developer Program:** active through 2027-04-20
- **Bundle ID:** `com.grayyachts.marinetech` · **Team ID:** `L34MUY39UV`
- **ASC App ID:** `6762853683` · **App name (ASC):** `JBY-Marine Tech` (in-app display name remains `Marine Tech`)
- **ASC API key:** `2B5Z869244` (Issuer `f3b47a16-d70b-4ef4-bc3b-e30fed4d2766`); `.p8` lives at `mobile/.secrets/AuthKey_2B5Z869244.p8` (gitignored)
- **EAS:** owner `cgrayy`, slug `marine-tech`, project `5e70f74a-b7b2-49e0-a65f-4e40d2527fb0`
- **Live:** v1.0, v1.1.0 and **v1.2.0** are all shipped. v1.2.0 (Apple + Google SSO) went live **2026-06-12** — verified against the public storefront 2026-07-29.
- **Agreements cleared 2026-08-11.** Two were outstanding (they sign separately and propagate ~3 min apart); the ASC API is fully open again. Symptom to recognise: `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`, sometimes on *some* endpoints only — reading the app can succeed while versions/builds still 403.
- **v1.3.0 / build 38** building 2026-08-11 with the mobile Service Campaigns work. ⚠️ `runtimeVersion` follows `appVersion`, so OTA to 1.3.0 will NOT reach 1.2.0 devices — publish to both runtimes while two versions are live.
- **EAS Update:** wired with `runtimeVersion = appVersion` (build 24+ can receive OTA; build 23 cannot). OTA only applies when the installed build's runtime matches exactly — publish to both runtimes if two versions are live (run from `mobile/`, no `--runtime-version` flag).

**Autonomous App Store update flow** (uses ASC API end-to-end):
1. EAS production build, non-interactive via env vars — see `reference_eas_noninteractive_ios_creds` memory (`EXPO_ASC_KEY_ID`, not `EXPO_ASC_API_KEY_ID`)
2. `eas submit --id <buildId> --profile production` — uploads + processes
3. `node scripts/asc-submit.mjs <version> <buildNumber>` — creates `appStoreVersion`, attaches build, sets `whatsNew`, submits for review (note: root `scripts/`, not `mobile/scripts/`)
4. **Gotcha:** final submit will 409 with `STATE_ERROR "Version is not ready yet, try again later"` for a few minutes right after attach. `node scripts/asc-resubmit.mjs` polls past it.

**Reusable ASC API scripts** (`mobile/scripts/` except where noted, all sign their own JWT from the `.p8`):
- `asc-builds.mjs` — list recent builds
- `asc-upload-screenshots.mjs` — parametric by device type
- `asc-fill-metadata.mjs` — name / subtitle / description / keywords
- `asc-attach-build-and-categories.mjs` — attach build + set categories
- `asc-finalize-listing.mjs` — age rating + review details
- `asc-fix-blockers.mjs` — copyright + content rights flags
- `asc-set-free-pricing.mjs`
- `asc-submit-for-review.mjs` + `asc-resubmit-v2.mjs` (retry path)
- `asc-add-tester.mjs` — TestFlight invite

**Reviewer / demo credentials** (for Apple App Review):
- Email: `appreview@grayyachts.com` / Password: **not stored here** — set `APP_REVIEW_PASSWORD` in your shell; the value belongs only in App Store Connect's review notes. (It was previously committed in four tracked files; rotate it.)
- Seeded as a real `tech` Supabase user with a "Demo Customer (App Review)" customer + "Sea Trial" boat + assigned job
- Privacy + Support pages live at `https://grayyachts.com/marine-tech/privacy` and `/support` (deployed from the `grayyachts.com` repo)
