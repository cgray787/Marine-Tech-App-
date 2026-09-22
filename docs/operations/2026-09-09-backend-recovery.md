# Marine Tech backend recovery — 2026-09-09

## Outcome

Backend restored. PostgreSQL, REST and Auth all report healthy. Authenticated owner requests load the production dashboard, jobs and calendar. Read/write mode is enabled with no temporary override active. No migration to a different host was performed.

The user upgraded JBY Yachts to Pro after the approximately $31/month proposal. Disk expansion to 16 GB and Small compute were subsequently applied and verified. No business records or WAL files were manually deleted. Existing working-tree edits were preserved.

Email alerting is prepared locally and tested, but NOT deployed or enabled. The user selected email; the destination address is still awaiting confirmation. See `ops/backend-monitor/README.md`. The monitoring migration and Edge Function have not been applied/deployed.

## Updated budget requirement

The user clarified after recovery that Pro is temporary for this paid month only. The intended steady state is Supabase Free and/or a migration to another free option such as Neon. The approximately $31/month configuration is a recovery bridge, not an accepted permanent operating budget. Do not assume recurring paid hosting is preferred or downgrade the recovered production system before a replacement/free-tier plan has been tested. No subscription cancellation or downgrade has been scheduled. Confirm the actual billing renewal date before arranging the change.

The recovered database (about 52 MB) and stored files (about 8.3 MB) are small; WAL accumulation and compute/I/O behavior, rather than ordinary application data volume, are the constraints to investigate. Code inspection confirms the mobile app depends on Supabase authentication, table/RPC access, photo storage, realtime and offline replay. A Neon migration must cover these dependencies. Separating independent projects or automation databases is easier than distributing tightly linked Marine Tech tables across two providers.

## Confirmed incident evidence

Project `ikfcnqdrlvhvlyhiuphs`, JBY Yachts, AWS us-west-2.

- Initial project summary said ACTIVE_HEALTHY, but individual db/rest/auth services were UNHEALTHY. SQL failed ECONNREFUSED and public authentication repeatedly timed out.
- PostgreSQL logs at 2026-09-09T05:32:32.945Z: `could not write to file "pg_wal/xlogtemp.429735": No space left on device`. Earlier entries repeatedly failed recovery for the same reason.
- Log queries must include explicit `iso_timestamp_start` and `iso_timestamp_end`; without them the API defaults to the last minute. Earlier empty results did not show absence of errors.
- After PostgreSQL recovered, the database was only 52,235,411 bytes, but WAL occupied 8,120,172,950 bytes across 486 files. This explains the bulk of the full disk. No replication slots were present at that inspection.
- The original reason the logs accumulated remains UNVERIFIED. The user also reported exhausted disk I/O; historical budget consumption was not independently retrieved. Do not infer that application tables, photos or any particular integration caused the outage.

## Actions and verification

1. Confirmed JBY Yachts plan changed from Free to Pro.
2. Expanded gp3 disk from 8 GB to 16 GB; retained 3000 IOPS and 125 MiB/s. Modification timestamp: 2026-09-09T16:25:31.730Z.
3. Requested one restart after expansion because PostgreSQL still refused connections. Restart accepted HTTP 200. PostgreSQL started at 16:29:03.575057Z; a previously failing query then returned `reachable: 1`.
4. Applied `ci_small` after restart completed. Verified selected compute Small at 16:34:32Z. Memory metrics later showed approximately 1.92 billion bytes total and 1.29 billion bytes available.
5. Used the supported temporary-disable-readonly endpoint while the old restriction persisted. Subsequently verified `/readonly` reported `enabled: false`, `override_enabled: false`; fresh SQL reported both default/current read-only settings `off`. Normal operation does not depend on an active temporary override.
6. At 16:36:32Z the service health endpoint reported all three services healthy. A later independent health check confirmed the same.
7. A diagnostic session for the existing owner account successfully read profiles, customers, boats, jobs and report_photos through authenticated REST, exercising RLS. The test used an admin-generated magic link without sending an email or changing the password. It signed out only its diagnostic session afterward; no session tokens were printed or persisted.
8. With that real user session encoded through the application's Supabase SSR client, production `/dashboard`, `/dashboard/jobs` and `/dashboard/calendar` returned HTTP 200 without a login redirect or server-error page. This was HTTP/SSR verification, not a physical mobile-device test or a password/Turnstile login test.
9. Disk metrics at 16:36:50Z: filesystem size 16,797,093,888 bytes; available 15,480,520,704; used 1,316,573,184 (about 7.8%). WAL declined automatically to 1,073,742,230 bytes. At 16:38:24Z archived_count had risen to 5 and failed_count remained 0 since restart.
10. Verified live counts: 11 profiles, 51 customers, 40 boats, 69 jobs, 4 report-photo records, 12 auth users. Storage contains 5 objects; table and object totals measure different things.

## Backups

Protected machine-local backup folder, relative to the shared workspace:

`Backups/Marine Tech/2026-09-09T163717Z/`

- `database.dump`: 1,984,561-byte custom PostgreSQL archive.
- `manifest.txt`: 857 archive entries.
- `database.sha256`: checksum.
- `storage-objects/` and `storage-manifest.json`: all 5 storage objects, 8,269,617 bytes total, with individually verified lengths and SHA-256 hashes.
- Folder/file permissions created with umask 077. Credentials were held in memory; a CLI login with a five-minute password lifetime performed the dump in read-only mode as the existing postgres role.
- `pg_dump` succeeded. `pg_restore --list` and decoding the entire archive to `/dev/null` succeeded. A restore into a separate running database has NOT been tested.
- Earlier failed attempts left incomplete archives in other timestamped folders. Only the folder above is the completed backup; do not treat earlier files as usable exports.
- Supabase's backup API now lists a COMPLETED physical backup inserted at 2026-09-09T16:37:25.400Z and earlier backups. Its initially empty listing did not prove that provider-side copies did not exist. PITR remains disabled.

## Email monitor prepared

Files: `ops/backend-monitor/`, `supabase/functions/backend-health-probe/index.ts`, `supabase/migrations/052_backend_health_snapshot.sql`.

The design uses an external Cloudflare Worker every five minutes so outage detection is independent of Supabase. It checks Auth, REST, dashboard availability and a dedicated-token-protected capacity probe. The token grants no database or account access. The SQL function is restricted to service_role and returns aggregate metrics only.

Alerts cover two consecutive failures, read-only mode, WAL >= 4 GiB, combined database/WAL >= 12 GiB, and a latest archival attempt that failed. Repeats hourly during an incident and sends one recovery email. Combined database/WAL excludes other filesystem contents and does not measure the daily I/O budget.

Four Node regression tests passed, including the incident's 8.1 GB WAL case, invalid metrics, transient failure debounce, recovery notification and retry after unaccepted email delivery. Live email delivery and scheduled execution remain unverified because deployment is pending a confirmed destination. Cloudflare also requires a verified sending domain and destination for its send-email binding.

## Migration and remaining reliability work

Recovery in place preserved the backend URL and installed mobile clients. Moving hosts remains possible, but no host guarantees zero outages. Self-hosting introduces responsibility for database maintenance, updates, backups and availability. A move to a different backend platform would also require replacing Supabase-specific Auth, Storage, Realtime and RLS behavior.

Before any migration: inventory/export the live schema, auth users, storage objects, functions, schedules, secrets and integrations; test a restoration in isolation; account for existing mobile builds, OAuth callbacks and queued offline writes. Repository migrations alone are not a full live deployment inventory. `mobile/lib/supabase.ts` currently hardcodes this backend URL; both web dashboards also depend on it.

Remaining: confirm alert destination and deploy/test monitor; perform an isolated restoration drill; observe WAL/archival and I/O trends; investigate historical accumulation if it recurs. Scheduled integration backfills were not run: those may write to Salesforce or send emails and need their own scoped verification.

## Sources and diagnostics

- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/platform/database-size
- https://supabase.com/docs/reference/api/v1-get-project-logs
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://developers.cloudflare.com/email-service/configuration/send-bindings/

Machine-local operational scripts are in `/private/tmp/quo-sf-diagnostics/`: `health.py`, `marine_expand_disk.py`, `marine_small_compute.py`, `marine_inspect_db.py`, `marine_verify_app.py`, `marine_verify_dashboard.cjs`, `marine_backup.py`, and `marine_backup_storage.py`. They use saved local CLI authentication without printing credentials. Treat the backup export scripts as sensitive operational tools and preserve the completed export independently of temporary scripts.
