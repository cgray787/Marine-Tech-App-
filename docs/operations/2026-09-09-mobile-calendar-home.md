# Mobile calendar home — September 9, 2026

Implemented on `feat/mobile-calendar-home` in `.worktrees/calendar-home`, based on `fe3b518`. The main checkout contains unrelated work and the separate backend recovery/monitor drafts; these were left intact.

The requested mobile experience opens to Month, with jobs inside each date and a scrollable selected-day agenda below. Month, Week, and Day controls occupy the bottom. Week groups jobs by day; Day retains the hourly schedule with larger, quieter job rows. The profile menu opens Clients, Jobs, Service, PDI and account settings. The former Clients index moved unchanged to `mobile/app/(tabs)/clients.tsx`; the index now redirects to Calendar. Existing form implementations remain intact.

A date seeds job creation at 9 AM local time; an empty hourly slot seeds its own time. Saving opens the new job's details. Job cards open details directly, long presses retain rescheduling, and job details now link to the client record. Tech calendars show that tech's assigned jobs; other roles see the schedule allowed by existing RLS. Viewer creation/rescheduling controls remain hidden. No access policies or database schema changed.

Calendar queries include visible padding dates and jobs whose multi-day end overlaps the range. Mobile date helpers use the phone's local start date, preventing UTC evening jobs from appearing on the following day. Customer/boat picker queries run only while the creation sheet is open. Existing realtime updates and refresh-on-return keep the schedule current. Failed refreshes show a retry message.

## Validation

- `mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json` passed.
- `TZ=America/Los_Angeles npx vitest run __tests__/calendar/mobile-navigation.test.ts` passed: five tests covering month padding, cross-month weeks, leap-day navigation, local evening spans, and overlap querying with tech scope.
- `npx expo export --platform web --platform ios --output-dir /private/tmp/marine-calendar-final` from `mobile/` passed. This validates web and iOS JavaScript/Hermes bundles; it is not a signed native binary or physical-device test.
- Playwright against the exported web app in Chrome, with all Supabase requests intercepted and synthetic users/jobs: calendar landing, Month/Week/Day switching, Clients menu round trip, direct job details/client link, and creating a seeded-date paperwork job then opening its details passed. No production records were created.
- Visual checks at 390×844 and 375×667. Small-screen bottom controls remained within the viewport. Screenshots contain synthetic data: [Month](../previews/calendar-home/month.png), [Week](../previews/calendar-home/week.png), [Day](../previews/calendar-home/day.png), [small phone](../previews/calendar-home/small-phone.png).
- `git diff --check` passed.

## Release and remaining context

Published to the production Expo Updates channel on September 9, 2026 after the user explicitly requested deployment. Preview screenshots are browser renders of the actual mobile components; physical-device receipt and gestures have not been directly observed.

The user's Supabase Pro month is temporary. This UI work does not migrate or downgrade the backend. Backend recovery evidence, backup locations, and the pending email-monitor destination remain in the main checkout's separate recovery handoff. Do not interpret this change as completing the Supabase/Neon cost-reduction work.

## Production release verification

Source commit: `014988b`. Production channel is active and maps to the `production` EAS branch. App Store Connect reports 1.2.0 ready for sale; EAS also has the finished 1.3.0 iOS build 38. Comparing current source with the 1.2 build commit `cb507ecc` showed no dependency, lockfile, Babel, or EAS build configuration changes; app config differs only in version/build number.

Published iOS and Android updates for both runtimes:

- 1.2.0: group `36cff10e-b6ed-431a-9883-e35fd4574553`, published 17:46:30 UTC.
- 1.3.0: group `e5030bc4-5c46-4ed4-857b-96621aba4820`, published 17:45:57 UTC.

The 1.2 publication temporarily selected app version 1.2.0 for runtime compatibility, then restored app.json byte-for-byte. Both exports produced the same iOS/Android code bundles. No new native build or store submission was needed.

Verified all four production manifest requests by platform/runtime against the exact published update IDs. Downloaded both unique launch bundles using the manifest extensions' asset request headers and verified SHA-256 hashes. Raw CDN requests without these supplied authorization headers return 403; the supported update protocol succeeds. Physical phone receipt remains unobserved.

Previous 1.2 production update group, available for rollback: `dfa4d13e-dcb0-4b25-b7ef-161d1e78eccb`. The 1.3 build previously used its embedded update. Keep these runtime distinctions when rolling back.
