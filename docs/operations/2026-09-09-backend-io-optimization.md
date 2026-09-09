# Backend I/O optimization — September 9, 2026

User authorized backend I/O fixes, optimization, and restructuring as needed.
Implemented in `.worktrees/backend-io`, branch `fix/backend-io-efficiency`.
Mobile calendar release source remains on `feat/mobile-calendar-home`; this
backend deployment does not modify or republish mobile UI.

## Evidence and diagnosis

At 18:00 UTC, Supabase project `ikfcnqdrlvhvlyhiuphs` was ACTIVE_HEALTHY.
DB, REST, and Auth health were all healthy. Disk used 1,316,892,672 bytes of
16,797,093,888 bytes. The initial outage had already been recovered earlier
by temporary paid capacity/restart; this session addressed ongoing waste.

Database size: 52,399,251 bytes. The largest relation was
`cron.job_run_details`: 35,979,264 bytes and approximately 66,983 runs.
The parts-email cron ran every two minutes even with **zero rows in parts**.
It had about 66,354 successful historical runs and 554 failed runs. Most
failures were startup timeouts during the earlier incident. Its recent HTTP
responses were 200; this was unnecessary empty work, not currently failed mail.

Post-restart pg_stat_statements showed cron bookkeeping among the largest
WAL writers; the startup update scanned 4,200 blocks of execution history.
Application tables were small. No measured application query justified adding
many indexes or splitting the business database. Cache counters at 18:08 were
16,686,830 hits versus 2,106 reads (~99.99% hits); swap used under 1 MB.
These are post-recovery observations, not proof of the original incident's
sole cause or future Free-tier performance.

WAL was stable at 1,073,742,230 bytes, with zero current archiver failures and
active replication slots retaining only a few bytes. Managed min_wal_size was
1 GB, max_wal_size 4 GB, archive_timeout 120 seconds. No managed WAL parameters,
replication slots, authentication policies, business records, or paid compute
settings were changed in this optimization session.

## Applied changes

- Migration `055_backend_health_snapshot`: service-role-only aggregate metrics
  RPC and dedicated-token Edge Function `backend-health-probe`.
- Migration `056_backend_cron_retention`: daily cleanup at 10:27 UTC; retain
  successful cron history for 14 days and failed history for 30. Never delete
  active runs. No custom index was added to Supabase-owned scheduler tables.
- Cloudflare Worker `marine-tech-backend-maintenance`, two-minute schedule,
  invokes the existing parts handler directly and checks Auth/REST/database/
  dashboard. No empty pg_net queue writes or per-check database cron logs.
  KV/log state lives outside Supabase. Worker holds only dedicated probe,
  maintenance, and existing parts-dispatch tokens, no account/service-role key.
- Migration `057_parts_scheduler_to_cloudflare`: deactivated old parts cron
  after a successful live external check. Original job remains for rollback.
- Removed 58,977 expired successful history records after a full backup;
  compacted only cron history with one-time VACUUM FULL/ANALYZE through the
  database Management API. Direct temporary pooler role lacked cron schema
  permission; no permission grants/bypasses were introduced.

Cloudflare's fetch rejects `redirect: error`; first live checks exposed that
and it was changed to `manual`. Checks now preserve error details and tests
assert the supported redirect setting. The Supabase schedule stayed enabled
until successful replacement verification.

## Backup and validation

Fresh backup: workspace-relative
`Backups/Marine Tech/2026-09-09T180251Z/database.dump`, 1,990,050 bytes,
860 archive entries. pg_dump, archive listing, and full pg_restore decode to
`/dev/null` passed. Backup and credentials are machine-local/private.

After cleanup: database 20,507,795 bytes (~61% reduction); history 4,071,424
bytes (~89% reduction), about 8,010 retained records. Counts remained 70 jobs,
51 clients, 40 boats, 11 profiles, and 4 report-photo records.

At 18:13 UTC: disk used 1,285,025,792 bytes, available 15,512,068,096 bytes.
WAL stayed at 1,073,742,230 bytes, archiver failures zero. Final old parts cron
run: 18:10:00 UTC; it did not execute on the following two-minute tick.

Cloudflare tail observed an automatic two-minute event after cutover:
`outcome: ok`, zero exceptions, all checks healthy, parts sent 0, roughly
2.9 seconds wall time and 4 ms CPU. Deployed version:
`9323acb6-67fe-441c-bd8a-02095b2df1bb`.

Seven Node tests passed covering outage thresholds/debounce/recovery/retry,
unauthorized endpoints, external parts dispatch and its HTTP-200 error case.
Wrangler build/deploy passed. Unauthorized `/status` returned 401; live
`/check` returned healthy metrics. SQL confirmed anon/authenticated cannot
execute the health RPC; service_role can. Authenticated owner reads returned
profiles, clients, boats, jobs, and photos. Dashboard, Jobs, and Calendar each
returned HTTP 200 without server errors; the diagnostic session was signed out.
KV status may lag a just-completed
check because reads are eventually consistent.

## Remaining limits and Free-plan transition

Email destination is still unconfirmed (async question offered work/Gmail).
Email delivery is NOT enabled or claimed tested. Monitoring currently records
incidents in Cloudflare logs and protected status. Configure the confirmed
address/sender/Resend secret and verify delivery before claiming email alerts.

This monitor checks availability, WAL capacity, read-only mode, and archiver
failure; it does not read daily Disk I/O credits or full filesystem capacity.
Current capacity thresholds are for the existing 16 GB disk. Adjust them for
actual Free-tier settings before downgrade. Observe normal workload for a few
days before changing the temporary Pro plan; neither downgrade nor Neon
migration was performed. No paid service was added by this implementation.

A small database alone cannot guarantee no future I/O outage. The original
8 GB WAL accumulation was not reproduced, and this session does not establish
its sole cause. The changes remove measured idle write sources, bound log
growth, and add independent failure detection.

Rollback and deployment details: `ops/backend-maintenance/README.md`.
Supabase references: https://supabase.com/docs/guides/cron/quickstart and
https://supabase.com/docs/guides/troubleshooting/exhaust-disk-io.


## Free downgrade and Neon follow-up

The user subsequently requested an immediate return to Free and migration of
some projects to Neon. Subscription downgrade is NOT completed. Public
Management API credentials work for projects/database administration but the
billing `/platform/organizations/{slug}/billing/subscription` endpoint requires
a dashboard JWT; the saved CLI PAT is rejected. The Supabase billing page was
opened for the user to choose Change subscription plan → Free.

Account inventory: Marine Tech is active in JBY Yachts; Agentic Dashboard
`pmjqnwvcwnoaothfaxub` is inactive in organization `qngoiybbbydbirrftwqb`.
Agentic Dashboard source was located at `Projects/40 - AI & Tooling/claude-os`.
It uses Supabase Auth and Supabase query clients, so a database-only connection
string swap would break login/query paths. Project selection is awaiting the
user's async answer. Neon CLI browser OAuth timed out after 60 seconds; authentication is incomplete;
no Neon project or migration has been created and no source project resumed.

Applied `058_backend_health_free_readiness.sql` and updated external capacity
checks to warn at 400 MiB database size, with WAL warning based on the greater
of 256 MiB or twice managed min_wal_size. This adapts to a downgrade without
assuming the current paid disk's 16 GB capacity. Eight tests pass. These
changes prepare monitoring; they do not change the subscription itself.
