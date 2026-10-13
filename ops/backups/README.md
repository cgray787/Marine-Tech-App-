# Nightly Marine Tech backups

`backup.py` exports PostgreSQL (including Auth), downloads Storage objects,
exports private Vault values required for restoration, verifies the archive,
and can upload to a private Cloudflare R2 bucket. It downloads the uploaded
archive again and verifies SHA-256 before reporting offsite success.

## Production: Hostinger VPS (October 13, 2026)

The runner now lives on `srv1677456` (`45.132.242.109`), independent of the Mac.
`marine-tech-backup.timer` checks hourly at :15, with a daily backup window
starting at **04:15 Pacific/Honolulu**. Successful windows skip; failures retry
on the next hourly check. `Persistent=true` catches a missed check after reboot.

- Runner: `/opt/marine-tech-backups/backup.py`
- Private config and credentials: `/etc/marine-tech-backup/` (0700; files 0600)
- Snapshots and status: `/var/lib/marine-tech-backups/` (0700)
- PostgreSQL client: `/usr/lib/postgresql/17/bin`
- Unit definitions: `marine-tech-backup.service` and `.timer` in this folder
- Offsite: existing private R2 bucket, through the bearer-protected maintenance
  Worker `/backup-object/<timestamp>.tar.gz`; no desktop Wrangler session needed
- The Mac LaunchAgent is disabled and unloaded. Its snapshots remain available.

`backup.json` configures `supabase_token_file`, `monitor_secrets`, `offsite_url`,
`backup_timezone`, and the existing project/bucket/retention settings. Only the
required backup credentials are provisioned on the VPS; they are never committed.
The service writes only to its private state directory under systemd protection.
Current protected upload transport accepts archives up to 95 MiB; the verified
archive is approximately 29 MiB. Larger archives require multipart/S3 transport.

Operations: `systemctl status marine-tech-backup.timer`,
`journalctl -u marine-tech-backup.service`, and
`systemctl start marine-tech-backup.service` (runs only when due).
Full cutover evidence and rollback: `docs/operations/2026-10-13-vps-backups.md`.

## Mac setup retained for rollback

The former runner uses the Mac's existing Supabase CLI keychain and Wrangler
login. Credentials are not stored in the repository or scheduled-job arguments.
Snapshot contents are sensitive; never publish the bucket, archives or logs.
The database and file exports are sequential, not an atomic cross-service snapshot.

Machine-local config: `~/.config/marine-tech/backup.json`:

```json
{
  "project_ref": "ikfcnqdrlvhvlyhiuphs",
  "backup_root": "/absolute/private/backup/directory",
  "postgres_bin": "/opt/homebrew/opt/libpq/bin",
  "wrangler_bin": "/absolute/path/to/wrangler",
  "local_copies": 7,
  "r2_bucket": null
}
```

A null bucket creates verified local backups only. Enable R2 in Cloudflare,
create a private bucket with public access disabled, configure a 30-day lifecycle
for the `marine-tech/` prefix, then set its name in `r2_bucket`. Run manually and
verify `offsite_uploaded: true` before claiming offsite protection.

The former per-user macOS LaunchAgent ran at 04:15 local time. The Mac had to be awake
and online; missed calendar runs normally execute when it wakes. This is not an
always-on cloud scheduler. Existing CLI authentication must remain valid.

Recovery update (2026-10-13): the LaunchAgent runs the Python utility through
`/usr/bin/caffeinate -is` to prevent idle sleep during the backup (and system
sleep on AC power). Assertions end when the utility exits; the display can
still sleep. It also checks hourly with
`--scheduled`. A successful, offsite-verified backup for the current 04:15 local
nightly window makes these checks skip; failed or missing runs try again.
A file lock prevents concurrent manual and scheduled backups. Network timeouts,
connection failures and transient HTTP errors get up to three attempts with
5/10-second backoff. Authentication and other permanent HTTP failures are not
retried inside the run. Database export and R2 commands retry only timeouts or
recognized connection failures. Stage and error type are logged without raw
API responses, credentials or file URLs. A success record is atomically updated
only after archive verification, offsite verification and the monitor heartbeat.
`last-failure.json` records a later failure so it cannot be hidden by an earlier
successful backup in the same nightly window.

Tests: `cd ops/backups && python3 -m unittest -v test_backup`.
`latest-status.json` records the last completed run; a stale timestamp or a failed
LaunchAgent exit code requires attention. Seven completed local snapshots remain.

Restore: decompress the tar archive into a private directory, verify SHA256SUMS,
then use `pg_restore` with a compatible target database and appropriate ownership
and permission setup. Recreate buckets from storage-buckets.json and upload the
files under the exact names in storage-manifest.json. Vault secrets require careful
recreation on the destination. Auth provider settings and externally configured
Edge Function secrets are not fully recreated by a database restore.

The external maintenance worker receives protected backup heartbeats and warns
if a run fails or no successful run arrives for 36 hours. Set `monitor_url` and
`monitor_secrets` (path to the local maintenance-secret JSON) in backup.json.
After verifying offsite upload, also set REQUIRE_OFFSITE_BACKUP=true on the worker.

Production R2 destination: `marine-tech-private-backups`, prefix `marine-tech/`.
Public r2.dev access is disabled; no custom domains are attached. A complete
LaunchAgent run uploaded and downloaded its archive with matching SHA-256 on
2026-09-10. Nightly config includes the bucket; external offsite enforcement is on.
