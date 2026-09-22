# Mobile job editing — September 22, 2026

User reported no way to edit from mobile Job Details (Andrew Shuman / Axopar 28 screenshot). Fix is in cf12a5b; prior published calendar labels are preserved in eec6ea6.

## Evidence and limits

- `mobile/app/job/[id].tsx` previously exposed editing only through native `headerRight`, conditional on a loaded non-viewer profile. Screenshot had no right-side buttons. Both Connor profiles were checked live and are active admins. The physical-device reason the header did not render remains unverified; an unavailable profile can also hide it.
- The old `handleEdit` opened the service-report form. Its submission writes `status: "completed"`, reconstructs schedule fields, and creates a report for a new job. That is unsuitable for editing scheduled job metadata.
- The fix adds an in-content gold Edit job button, a retry for missing profile data, and a dedicated modal for customer, boat, services, notes, location, and start/end. Only changed fields are patched. Status, assignment, report contents, and untouched schedule fields are preserved. Report editing remains separately accessible.
- Saving requires an authenticated update returning a row; failed/denied saves keep the editor open. Calendar caches are invalidated and detail data reloads. Returning from report editing refreshes the detail screen.

## Verification

- `npm run test:mobile`: 13 tests passed, including opening the correct editor without a native header, viewer restriction, profile recovery, prefill/save/cancel, denied update, customer/boat consistency, schedule validation, and preservation of untouched job fields. React Native controls are DOM test doubles; these are not device screenshots.
- Mobile TypeScript passed. ESLint on changed production files had zero errors and two pre-existing warnings in job detail. `git diff --check` passed.
- Live database transaction assumed authenticated role and Connor's auth subject, updated one matching job's notes, verified the returned value, then rolled back. Result: `authenticated_rows_updated: 1`, `edited_value_returned: true`. Customer data was not retained from this test.
- Production iOS/Android exports passed. Both Hermes bundles contain the new editor and button. The runtime publications produced identical bundle filenames.
- No booted iOS simulator was available. Physical-device rendering/download remains unobserved.

## Production OTA releases

Production channel was checked active, mapped to the production branch.

| Runtime | Update group | iOS update | Android update |
| --- | --- | --- | --- |
| 1.3.0 | 3a9e6952-2b5c-43f7-bdc9-14508c2a77c4 | 01a0c9f9-d062-7267-9d92-001db74733b3 | 01a0c9f9-d062-7c6a-96b5-56b83f3984bf |
| 1.2.0 | 9e63b243-e21e-45c7-bdb1-1fcae3cf86a7 | 01a0c9ff-68ed-79da-b39e-474b1c1d58af | 01a0c9ff-68ed-76b6-baa9-fd0faec76b1f |

EAS confirmed both published. For 1.2, only the isolated worktree's app version was temporarily changed; app.json was restored byte-for-byte. No native dependencies or App Store submission changed. Phone needs a download and relaunch to apply OTA.

Canonical main was fast-forwarded to the fix. Unrelated existing changes were preserved. Calendar working edits exactly matched eec6ea6; a path-limited backup stash was retained before fast-forward. Isolated worktree: `/private/tmp/marine-tech-job-edit`, branch `fix/mobile-job-edit`.
