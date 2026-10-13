# Marine Tech backup migration to Hostinger VPS

## Cutover

User requested moving the repaired Mac automation to the existing VPS.
Production runner is now `srv1677456`, `45.132.242.109`. The Mac LaunchAgent
`com.grayyachts.marine-tech-backup` was disabled and unloaded only after the VPS
completed and verified a full offsite backup. Existing Mac snapshots were kept.
This supersedes the Mac scheduling instructions in the earlier October 13
[timeout recovery handoff](2026-10-13-backup-timeout-recovery.md).

## Runtime

- `/opt/marine-tech-backups/backup.py`, Python 3.12.3, PostgreSQL client 17.11.
- `/etc/marine-tech-backup/backup.json` references private Supabase and monitor
  credentials. Directory 0700, files 0600. No API keys are in this repository.
- Only the needed Supabase access token and monitor admin token were provisioned
  over SSH. No Gmail, Resend, SSH private key, or desktop Cloudflare login was copied.
- `/var/lib/marine-tech-backups/` stores seven completed local snapshots.
- `marine-tech-backup.service` is a systemd oneshot with a process lock,
  restricted filesystem writes, private tmp, and a 45-minute maximum runtime.
- `marine-tech-backup.timer` is enabled persistently. Hourly :15 checks use the
  04:15 **Pacific/Honolulu** nightly window. Already-verified windows skip.
  Failed runs retry hourly; transient requests also have bounded retries.
- Existing R2 bucket `marine-tech-private-backups`, prefix `marine-tech/`,
  retains its 30-day lifecycle. Existing alert monitoring remains active.

## Private R2 transport

The VPS had no authenticated Wrangler session. Rather than copy a desktop OAuth
refresh credential, the existing maintenance Worker now provides a protected
streaming PUT/GET endpoint restricted to timestamp-named backup objects. The
native R2 binding does not expose listing, deletion or public access. The VPS
downloads each uploaded archive and verifies its SHA-256.

Initial Worker version: `ee4958e8-cf65-4838-a430-88ebda15e50d`.
Reviewed production version: `68a9a815-5af4-4fa3-9540-c16884e8f418`.
The same admin bearer token protects the upload, download and heartbeat routes.
Current request cap is 95 MiB; the current archive is approximately 29 MiB.
If snapshots grow beyond that, add multipart/S3 transport before increasing
stored data. A larger request currently fails visibly and cannot report success.

## Verified outcomes

- 11 backup tests passed both locally and on the VPS, covering retry behavior,
  token-file authentication, timezone handling, duplicate-run prevention and
  exact offsite byte round trips. All 20 maintenance Worker tests passed.
- systemd validated both unit files. Initial service run exited 0.
- Real VPS backup completed **2026-10-13T17:56:20.125403Z**.
- Database archive: **654,860 bytes**, full decode verified.
- Storage: **15 objects**, **30,268,046 bytes**.
- R2 object: `marine-tech/2026-10-13T175549Z.tar.gz`.
- Archive SHA-256: `560f25b14ce243ba4bb739bd9fe4144bd7511c37e8bb3a497b52fe4bce891030`.
- Offsite upload and download matched; a separate VPS archive read also matched.
- An unauthenticated request for that actual backup returned **HTTP 401**.
- An immediate second scheduled-mode run exited 0 with
  `current-nightly-window-already-verified`; it did not make a duplicate backup.
- Timer is enabled and active; the next hourly check was 18:15 UTC.
- Mac `launchctl print-disabled` reports the job disabled; its running service
  is absent. Old Mac snapshots and its rollback plist remain available.
- At **18:00:16.396 UTC**, the automatic monitor reported `issues: []` and
  the VPS heartbeat from **17:56:20.125 UTC**, with `ok: true`,
  `offsiteUploaded: true`, zero consecutive failures and no email error.

## Review and overnight verification, October 14

The backup commit was rebased onto current `origin/main`, preserving the
existing disk-metrics grace fix (`e86851d`). The combined Worker was tested
and redeployed. Its live health state includes `diskUnavailableSince`.

All **34 tests passed**: 12 backup tests on both Mac and VPS, and 22 Worker
tests. New failure tests confirm that a corrupt offsite copy cannot send a
success heartbeat or replace the previous success record, and that a failed
heartbeat preserves the previous success record. systemd validation passed;
the timer remains enabled, private credential permissions remain restricted,
and the Mac scheduler remains disabled.

The natural October 14 **04:15 HST** backup completed at
**2026-10-14T14:15:30.097900Z**, exit status 0. It decoded a 651,743-byte
database archive and exported all 15 Storage objects. The offsite archive
`marine-tech/2026-10-14T141504Z.tar.gz` is 30,190,042 bytes. Its SHA-256 is
`1f6b212b0fabb2e88a599ea7fee2d70ff874d186919c6770844e6b616811040d`.
A separate review downloaded it again and matched the local and recorded
checksums. Anonymous access returned HTTP 401. Automatic monitor state at
**2026-10-14T17:56:00.537Z** reported no issues and a successful offsite backup.

A complete restore into another database has not been performed. Archive
decode and offsite checksum checks do not substitute for a restore drill.
Failed or stale backups remain covered by the existing monitor.

## Operations and rollback

Check `systemctl status marine-tech-backup.timer` and
`journalctl -u marine-tech-backup.service`. A manual `systemctl start
marine-tech-backup.service` respects the existing nightly-window skip.

To roll back, disable the VPS timer first, then re-enable/bootstrap the retained
Mac LaunchAgent. Never leave both schedulers enabled. The previous Mac runner
still supports its existing Wrangler upload path, and the Worker addition is
backward compatible with its heartbeat. Leave all verified snapshots intact.

Sources: live SSH/systemd output, private status file, archive checksums,
Cloudflare deployment output, anonymous HTTP check, and Mac launchctl state.
Transport reference: [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
Timer reference: [systemd timer documentation](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml).
