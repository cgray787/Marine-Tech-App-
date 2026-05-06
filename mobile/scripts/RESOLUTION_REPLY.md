# Resolution Center reply for v1.0 rejection

Paste this into App Store Connect → My Apps → JBY-Marine Tech → App Review →
Messages, in reply to the 2026-05-04 rejection.

---

Hello App Review team,

Thank you for the detailed feedback. We have addressed both flagged guidelines.

## Guideline 2.3.8 — Performance: Accurate Metadata (icons)

We regenerated the app icon as a flat 1024×1024 RGB PNG with no embedded
rounded corners or transparency, so iOS can apply its standard corner
masking consistently across every size. The favicon was also regenerated
from the same source so all icon sizes are visually identical. The new
icon ships in build 25.

## Guideline 3.2 — Business: distribution model

We have repositioned the app for general public distribution, and the new
build 25 fully supports public signup.

Answers to the five questions:

**1. Is the app restricted to users who are part of a single company or
organization?**
No. Anyone can create a free account directly in the app via the
"Create a free account" link on the sign-in screen. There is no
company affiliation requirement, no invitation requirement, and no
geographic or industry restriction.

**2. Is the app designed for use by a limited or specific group of
companies or organizations?**
No. The app is designed for two broad public audiences: independent
marine mechanics (any solo or shop technician who services boats) and
boat owners (anyone maintaining their own vessel). Any individual or
business can sign up and use the app.

**3. What features in the app are intended for use by the general public?**
All features:
- Customer + boat record management
- Service scheduling with calendar
- BAD/GOOD inspection checklists across Engine, Electrical, Hull,
  Safety, and Navigation systems
- Photo capture for HIN plates, engine hours, damage, and before/after
- Pre-delivery inspection (PDI) reports
- PDF export and sharing of completed reports

**4. How do users obtain an account?**
Public, in-app signup. From the sign-in screen, the user taps
"Create a free account", picks "Marine Mechanic" or "Boat Owner",
and enters their email + password. No invitation, no admin
provisioning, no email allowlist. The reviewer can test this directly
on build 25.

**5. Is there any paid content in the app and if so who pays for it?**
There is no paid content in the app today. All features are free for
every signed-up user, with a soft limit of 3 customers and 25 service
reports per free account. Users who exceed the free tier are directed
to email support to discuss higher limits — no in-app purchase exists
and none is required to use the core app.

The previous demo-account-only flow has been replaced with public
signup. The demo account credentials we provided previously
(appreview@grayyachts.com) are still valid as an *optional* shortcut
for reviewers who want to see populated data, but they are no longer
required — the review team can sign up fresh and the empty-state
onboarding will guide them through adding a customer, a boat, and
filing a service report.

We appreciate the review and are happy to provide any additional
information needed.

Best regards,
Connor Gray
connorgray41@gmail.com
