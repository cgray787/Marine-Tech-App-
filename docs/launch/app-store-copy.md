# App Store Listing Copy — JBY-Marine Tech

Drafts to paste into App Store Connect → "1.0.0 Prepare for Submission" page. All character limits enforced.

---

## Name (visible on App Store)
```
JBY-Marine Tech
```
(30 char max — uses 15)

## Subtitle (under the name)
```
Marine service & PDI reports
```
(30 char max — uses 27)

## Promotional Text (editable post-release without resubmit)
```
Document boat service jobs, run pre-delivery inspections, capture photos, and sync your day from the dock — built for marine technicians.
```
(170 char max — uses 137)

## Description
```
Marine Tech is the field service app for marine technicians — built by a yacht brokerage for the people who actually maintain boats.

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

Designed for iPhone and iPad.
```

## Keywords (100 char max, comma-separated, NO spaces after commas)
```
marine,boat,yacht,inspection,service,technician,PDI,checklist,fleet,maintenance,marina,survey
```
(uses 88)

## Support URL
```
https://grayyachts.com/marine-tech/support
```
(needs to actually resolve before submission — see `support.md` draft)

## Marketing URL (optional)
```
https://grayyachts.com/marine-tech
```

## Privacy Policy URL
```
https://grayyachts.com/marine-tech/privacy
```
(needs to actually resolve — see `privacy-policy.md` draft)

## Copyright
```
2026 Gray Yachts LLC
```
(or whichever LLC owns the app — confirm)

## Categories
- **Primary:** Business
- **Secondary:** Productivity

## Age Rating
All answers: **None / No.** Final rating: **4+**

## Version Info — "What's New in This Version"
```
Initial release.
```

---

# App Privacy ("nutrition label")

App Store Connect → App Privacy → Get Started. Answer exactly:

| Category | Collected? | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| **Contact Info → Email Address** | Yes | Yes | No | App Functionality |
| **Contact Info → Name** | Yes | Yes | No | App Functionality |
| **User Content → Photos or Videos** | Yes | Yes | No | App Functionality |
| **User Content → Other User Content** (notes, jobs, customers, boats, checklists) | Yes | Yes | No | App Functionality |
| **Identifiers → User ID** (Supabase `auth.uid`) | Yes | Yes | No | App Functionality |
| **Diagnostics → Crash Data** | No | — | — | — |
| **Tracking** | No | — | — | — |

**Tracking question:** "Do you or your third-party partners use data from this app for tracking?" → **No.** No ATT prompt needed.

---

# App Review Information

The single biggest cause of first-submission rejection: reviewer can't get past the login screen.

## Sign-in info — REQUIRED
- **Toggle "Sign-in required":** ON
- **Username:** `appreview@grayyachts.com` (create as a real Supabase user with `tech` role and `status='active'`)
- **Password:** [strong password — write it down here when set]

The reviewer account must have at least:
- 1 customer (e.g. "Demo Customer")
- 1 boat assigned to that customer (e.g. "Sea Trial — 35' Sportfish")
- 1 job assigned to the appreview tech, status `new`, with a marina + service types set
- (Recommended) 1 completed service report so reviewer can see a finished job

## Contact Information
- First name: Connor
- Last name: Gray
- Phone: [+1 country-code phone with area code]
- Email: connorgray41@gmail.com

## Notes
```
Marine Tech is an internal field-service app for marine technicians at JBY Yachts (Jeff Brown Yachts). Tech accounts are invite-only and provisioned by the shop owner, so the demo credentials above are required for review.

The app's main flow:
1. Sign in with the demo credentials provided.
2. Clients tab — see customers and their boats.
3. Service tab — start a service report on the seeded "Sea Trial" boat. Try the Engine / Electrical / Hull / Safety / Nav checklist categories. The Camera button uses the camera to attach an HIN plate or engine-hours photo.
4. Calendar tab — month view shows the seeded job; tap the day to see the weekly panel; long-press any job to schedule it.
5. PDI tab — pre-delivery inspection checklist (similar UX to Service).

Camera access is used to photograph boat conditions, HIN plates, and engine hours. Photo library access is used to attach existing photos to reports and to save inspection photos.

If you have any questions during review, please email connorgray41@gmail.com.
```

## Attachment (optional but recommended)
Record a 30-60s screen capture (iOS Screen Recording) of: login → open job → take a photo via Service tab → submit → return to Clients. Attach as `.mov` in the Review Notes section. Significantly cuts review time.
