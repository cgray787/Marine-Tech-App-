# Calendar customer names — September 14, 2026

User requested customer names on the mobile calendar and explicitly authorized publishing to the app.

MonthCalendar and CalendarAgenda use the customer name as the primary label. Clientless service jobs show Unassigned; paperwork retains Paperwork. The agenda detail shows boat name and location instead of repeating the customer. These changes are in the working tree on top of 794b2f8; unrelated existing edits were preserved.

Validation: mobile TypeScript check and git diff --check passed. EAS production exports succeeded for iOS and Android, with identical bundle names for both runtime publications.

Production channel was verified active and mapped to the production branch. EAS accepted both releases:

- Runtime 1.3.0: group `2c0b54d3-27c0-4b27-b2dc-d8f93afd6108`, iOS `01a0a09d-a281-7a2d-ac73-8a360686333b`, Android `01a0a09d-a281-7311-a8b6-1fe4fa09733a`.
- Runtime 1.2.0: group `f413ef3c-4bac-48d0-843f-d11a588528bb`, iOS `01a0a09e-2d47-7a3e-bf04-be49cd7ed922`, Android `01a0a09e-2d47-746e-a171-e5b9307c4572`.

The 1.2 publication temporarily selected app version 1.2.0; mobile/app.json was restored byte-for-byte afterward. No App Store submission was performed. Physical-device download and display have not been observed; the app must download the update and restart to apply it.
