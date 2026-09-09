# Calendar resume and preference polish — 9 September 2026

User authorized mobile calendar polish alongside backend reliability work.
The calendar now refreshes after the app returns to active use, subscribes to live
job changes only while visible and active, and coalesces change bursts into one
refresh. Leaving the screen/backgrounding cancels pending refreshes. Month/Week/Day
preference is stored per profile on the device. Existing forms, job details and
calendar layout remain intact.

Code commit `e8beb5a`. Two focused lifecycle tests passed. Mobile TypeScript check
and both iOS/Android production exports passed. Production OTA groups:
- runtime 1.3.0: `f94dbd69-2cf0-4dae-9743-24bbe67bf496`
- runtime 1.2.0: `ddb8b49c-cf44-4ea6-a2d6-4f36e047cdcb`

Both groups include Android and iOS. The first OTA reports the previous Git head
with dirty changes because the publish began before the source commit; its exported
bundle includes the same committed changes. The 1.2 publish temporarily changed only
appVersion to target existing native builds, then restored app.json to 1.3.0.

Published updates do not prove installation on the user's physical phone. The app
must fetch the update and restart. No native build/App Store submission was needed.
Do not deploy the older main branch's mobile source over this calendar release.

In the same session, separate authenticated backend checks verified job create/edit,
PDI save and photo upload/attachment/readback. Temporary test data was removed. That
verifies backend operations, not a physical-phone camera or offline test.
