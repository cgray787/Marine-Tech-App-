# Nightly Marine Tech backups

`backup.py` exports PostgreSQL (including Auth), downloads Storage objects,
exports private Vault values required for restoration, verifies the archive,
and can upload to a private Cloudflare R2 bucket. It downloads the uploaded
archive again and verifies SHA-256 before reporting offsite success.

Credentials remain in the Mac's existing Supabase CLI keychain and Wrangler
login. They are not stored in the repository or scheduled-job configuration.
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

The per-user macOS LaunchAgent runs at 04:15 local time. The Mac must be awake
and online; missed calendar runs normally execute when it wakes. This is not an
always-on cloud scheduler. Existing CLI authentication must remain valid.
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
