# Alerts and nightly backup setup — 9 September 2026

User authorized completion of Marine Tech alerts, Free transition, automatic
offsite backups, calendar polish and yacht search. They requested approval prompts
through ChatGPT Remote while away. No API exists in this tool session to force a
Remote push notification; account setup links and questions were posted in chat.

## Alerts

Used the app's verified existing admin/parts recipient,
`connorgray@jeffbrownyachts.com`, after asking for a preference and continuing with
that existing default. The project Vault's send-only Resend key was reused;
`Marine Tech <onboarding@resend.dev>` is the existing parts sender default.
Resend accepted test email `b2b7aaf2-0cb0-4e53-83d8-4a852be84387`. Delivery to the
inbox is not independently confirmed. Worker secrets installed and live scheduled
status confirmed `emailConfigured: true`. No fake outage was created.

## Backups

`ops/backups/backup.py` runs nightly at 04:15 local time through LaunchAgent
`com.grayyachts.marine-tech-backup`. Runtime copy lives in
`~/.local/share/marine-tech-backups/`; config is
`~/.config/marine-tech/backup.json`. Account credentials stay in local CLI stores.

Verified a complete run both manually and through launchctl. LaunchAgent returned
exit code 0. The 22:25 UTC run produced a 703,937-byte Postgres custom archive and
15 Storage objects totaling 30,268,046 bytes. All archive contents decoded;
Storage lengths and SHA-256 manifests verified. No full database restore performed.

Local snapshots: canonical workspace `Backups/Marine Tech/Automated/`.
Seven completed local copies retained. Backup failures and heartbeats older than
36 hours are checked by the external worker. The Mac must remain available;
this is a user LaunchAgent, not an always-on cloud runner.

Offsite upload is implemented with private R2 upload and downloaded checksum
verification, but NOT activated or tested: Cloudflare returned error 10042,
"Please enable R2 through the Cloudflare Dashboard." No connected CloudStorage
folder or rclone destination was present. Config `r2_bucket` stays null;
`REQUIRE_OFFSITE_BACKUP` stays false until an upload is verified. The protected
monitor reports `offsiteUploaded: false`; do not call these offsite backups yet.

Once R2 is enabled: create a private bucket (no public URL), set 30-day lifecycle
for `marine-tech/`, configure the bucket name, run the backup, verify downloaded
SHA-256, then enable REQUIRE_OFFSITE_BACKUP on the worker. Current source documents
include sensitive Auth/Vault data and must never be made public.

## Free-plan access limitation

The Supabase subscription endpoint returned HTTP 401, "JWT could not be decoded"
for the authenticated CLI PAT. It requires a signed-in dashboard session, and no
connected browser-control session was available. The billing link was posted to
the user. No subscription change or post-downgrade test was claimed completed.

## Functional verification

Authenticated owner dashboard, jobs and calendar pages returned HTTP 200.
Temporary authenticated job create/edit, PDI save, and photo upload/attachment/
exact readback all passed. Tests use the actual profile ID and an existing customer
in its location, respecting PDI RLS. All temporary records/files were removed and
diagnostic sessions revoked. Existing business records were not edited.

Sources: Supabase APIs and authenticated REST/Storage, Resend response, Cloudflare
scheduled status, actual launchctl execution/log, and verified backup manifests.

Final maintenance Worker version: `6d7c17c4-d912-455c-93e9-7d7bf02664cd`.
At 22:38:36 UTC, automatic status showed zero issues, email configured, and the
verified 22:25:24 backup heartbeat with `offsiteUploaded: false`. Thirteen
maintenance tests passed, including heartbeat validation and stale-backup checks.

## Continuation — 9 September, 17:38 Pacific

Rechecked billing and R2: billing still returns 401 JWT could not be decoded;
R2 still returns 10042 requesting dashboard activation. Disk remains provisioned
at 16 GB. A guessed /config/compute route returned 404 and provides no compute
plan evidence. No downgrade or offsite upload occurred.

Found and reproduced an unhandled email network timeout that aborted saving the
current health check. The worker now persists that health result and records a
sanitized delivery error; a subsequent accepted retry clears the delivery error.
Regression failed with the original code and passes with the fix. All 14 tests in
ops/backend-maintenance pass; its suite already includes disk-metric coverage.
An additional attempted test path did not exist and was not counted as a pass.

Deployed Worker version 81cfb9e3-a121-45ac-b20d-47f8914493c5. No production outage
or email failure was deliberately triggered. LaunchAgent remains loaded for
04:15 local, last exit code 0. At 00:36:22 UTC the live monitor had zero issues,
16.71 sampled IOPS, 351178 bytes/s, and the verified local-only backup heartbeat.
These sampled rates do not measure the Supabase daily I/O credit balance.
