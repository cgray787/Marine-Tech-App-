# Marine Tech Free-plan disk readiness — 9 September 2026

User asked to prevent a repeat disk-I/O incident when returning to Free.
Scope: project `ikfcnqdrlvhvlyhiuphs`, branch `fix/backend-io-efficiency`, existing
`.worktrees/backend-io`. No mobile/dashboard release or billing change.

## Current evidence

At 20:02 UTC, direct live SQL showed 20,556,947 database bytes, 1,073,742,230
WAL bytes (managed minimum 1 GiB), zero archiver failures, and read-only off.
The replication slot was active and retained approximately 16 MiB. Business
counts were 72 jobs, 51 customers, 40 boats and 14 photo records. These counts
have grown since the earlier backup; no business data was removed in this audit.

`cron.job` confirms old two-minute parts job inactive. Daily history retention
and daily Quo activity job remain enabled. History stayed at 8,010 rows and
4,071,424 bytes, with no new parts cron runs after 18:10 UTC. The retention job's
first scheduled execution is still in the future; its scheduled outcome is not
yet verified. Existing bounded retention SQL is unchanged.

Live filesystem metrics: data disk approximately 1.285 GB used of 16.797 GB.
These are the temporary paid-instance settings, not a measurement on Free.
Auth, REST and database health endpoints all reported healthy.

## Monitoring gap fixed and deployed

Previously the monitor measured database/WAL size, but neither physical disk
space nor I/O rate. The existing protected Edge Function now reads Supabase's
Metrics API using its existing service-role credential and returns only a
whitelist of aggregate disk counters. Credentials and raw metric labels never
leave the backend. The Cloudflare Worker still has no service-role/account key.

The Metrics API supports gzip: a live request returned approximately 22 KB
compressed versus 375 KB uncompressed. The probe explicitly requests gzip.
Monitoring remains on the existing two-minute schedule; it introduces no new
pg_cron/pg_net records or table writes. Latest counters live in Cloudflare KV.

Warnings: database 400 MiB, data filesystem 80% used, sustained sampled rate
200 operations/sec or 4,000,000 bytes/sec (80% of documented Nano baselines).
Existing adaptive WAL/read-only/archive-failure checks remain. Missing metrics
report a monitoring failure; counter resets, changed disks or stale intervals
start a new baseline. The existing two-failure notification debounce remains.

These rates are interval averages across physical devices, not the provider's
daily Disk I/O credit balance. Very brief bursts may be averaged out. The
Management Metrics API did not expose a daily credit-balance series in this
inspection; view that in Supabase Database Health.

Cloudflare version: `57151d04-6cd5-49c4-af23-780e05ccf73e`.
Supabase `backend-health-probe` redeployed with its dedicated-token check intact.
Eleven Node tests passed, including actual parser shape, missing metrics,
restart/stale-counter handling and warnings below Free sustained limits.
Initial live scheduled check returned both disk counters and filesystem metrics.

## Remaining transition checks

The database is well below Free's 500 MB database quota, but current paid compute
cannot prove behavior on Nano's smaller memory/CPU allocation. After downgrade,
check the live monitor across normal technician use and Supabase Database Health
for I/O credit consumption, swap pressure and backend availability. Do not reduce
managed WAL settings or delete replication slots to force a lower footprint.

Email alerts remain unconfigured: user was asked for a destination in this turn.
No alert email was sent. Warnings currently appear only in protected status and
Cloudflare logs. No subscription downgrade was performed.

Sources: live Supabase SQL, Metrics API, protected Cloudflare status, deployed
Edge Function and Node tests; official documentation:
- https://supabase.com/docs/guides/platform/compute-and-disk (Nano 250 IOPS / 5 MB/s)
- https://supabase.com/docs/guides/platform/database-size (500 MB database quota)
- https://supabase.com/docs/guides/troubleshooting/exhaust-disk-io
- https://supabase.com/docs/guides/observability/metrics/vendor-agnostic

Live 156.9-second sample after deployment measured 0.656 operations/sec and
27,306 bytes/sec across the two physical devices. This is a short paid-instance
sample, not peak workload validation or a Free-plan load test. Unauthorized
probe returned 401; authorized probe returned 200 with resource metrics and
no resource error after the final gzip deployment.

Final automatic schedule at 20:08:46 UTC confirmed no issues and non-null
interval rates: 0.861 IOPS, 35,810 bytes/sec over 119.644 seconds. This verifies
consecutive live scheduled samples and rate computation, not merely deployment.
