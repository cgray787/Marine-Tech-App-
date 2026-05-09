# Resolution Center reply for v1.0 build 26 rejection (resubmit as build 28)

Paste this into App Store Connect → Marine Tech → App Review → Messages,
in reply to the 2026-05-07 rejection (Submission ID
17108359-e147-4bf3-aade-8fa9f639cf2c).

Attach the screen recording in the **App Review Information → Notes** field
on the version page before sending the reply.

---

Hello App Review team,

Thank you for the detailed feedback. We have addressed both guidelines in
build 28.

## Guideline 5.1.1(v) — Account deletion

Build 27 adds an in-app "Delete Account" flow under
Account Settings → Delete Account. The user types DELETE to enable the
button, taps "Delete My Account", and confirms in a native dialog.
On confirm the app calls a Supabase RPC (`delete_user_account`) that:

- Deletes all customers, boats, jobs, service reports, PDI reports,
  checklist items, and report photos owned by the user
- Deletes the user's profile row
- Deletes the user's auth.users row

The user is then signed out and returned to the login screen. There is
no "deactivate" path — deletion is immediate and permanent. No website
visit, phone call, or email is required.

A screen recording captured on a physical iPhone, demonstrating signup,
navigating to Account Settings → Delete Account, and completing the full
deletion flow, is attached in the App Review Information Notes field.

## Guideline 2.1(b) — Business model

Marine Tech has no paid features, no subscriptions, no in-app purchases,
and no external paid content. The entire app is free to all users with
no usage caps.

Answers to the five questions:

**1. Who are the users that will use the paid features and services in the app?**
None. There are no paid features or services in the app.

**2. Where can users purchase the features and services that can be accessed in the app?**
Nowhere. Nothing in the app is purchasable. No payment is collected at
any point in the app or out of it.

**3. What specific types of previously purchased features and services can a user access in the app?**
None. The app does not access, unlock, or restore any previously
purchased content of any kind. There is no entitlement system, no
"restore purchases" flow, and no external account linkage that grants
paid features.

**4. What paid content, subscriptions, or features are unlocked within the app that do not use In-App Purchase?**
None. No content, subscriptions, or features are gated behind any
payment, anywhere. All features — customer/boat records, calendar,
service inspections, PDI reports, photo capture, PDF export — are
available to every signed-up user immediately and at no cost.

**5. How do users obtain an account? Do users have to pay a fee to create an account?**
Public, in-app signup, free of charge. From the sign-in screen, the
user taps "Create a free account", picks "Marine Mechanic" or
"Boat Owner", and enters email + password. No payment, invitation, or
admin provisioning is required. Anyone can sign up.

The previous build (26) included Postgres triggers that raised an error
mentioning "contact support to upgrade" if a free-tier user exceeded
soft caps of 3 customers / 25 reports. We see how this language could
be read as paid content offered outside IAP. In build 28 those triggers
are dropped entirely (migration 011) — there is no usage cap, no
contact-support escalation, no upgrade path, paid or otherwise.

We appreciate the review and are happy to provide any additional
information needed.

Best regards,
Connor Gray
connorgray41@gmail.com
