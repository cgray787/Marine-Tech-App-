# Marine Tech backend maintenance

Production Cloudflare Worker: `marine-tech-backend-maintenance`.
Runs every two minutes outside the Supabase database. Calls the existing parts
notification handler and checks Auth, REST, the dashboard, and a dedicated
aggregate database-health probe. Empty parts checks do not enqueue pg_net HTTP
requests or create pg_cron execution records. Normal parts delivery still uses
the existing handler and destination; it was not manually tested with an email.

## Authentication and state

`BACKEND_MONITOR_TOKEN`, `PARTS_CRON_SECRET`, and `MONITOR_ADMIN_TOKEN` are Worker
secrets. Only the monitor token is also configured on the health Edge Function.
The Worker has no Supabase management token or service-role credential.
`/status` (GET) and `/check` (POST) require the admin bearer token. `/check` also
runs parts processing, so use it knowing that pending parts can generate their
normal notification. Health metrics contain no client or job details.

KV `STATE` holds the latest check. KV reads are eventually consistent; an
immediate `/status` after `/check` can briefly show an older result. The live
response from `/check` and scheduled event logs provide direct execution proof.

Email alerts are implemented but NOT configured: the user's destination is
unconfirmed. To enable later, configure confirmed `ALERT_TO`, verified
`ALERT_FROM`, and a machine-local `RESEND_API_KEY` as a Worker secret. Then
verify alert and recovery delivery. Do not copy credentials into this repo.
Until enabled, incidents appear in Worker logs and protected status only.

Capacity checks warn at 400 MiB database size, ahead of the Free database quota.
WAL warnings adapt to the instance's configured minimum: the larger of 256 MiB
or twice `min_wal_size`. Missing baseline metrics conservatively assume 1 GiB.
Read-only mode and the most-recent archival failure are also checked. The protected probe also reads compressed aggregate OS metrics. It warns at
80% filesystem use, 200 disk operations/second, or 4 MB/second across physical
disks (80% of the documented Nano baseline). Rates compare consecutive samples;
restarts, missing devices and stale intervals establish a fresh baseline.
Missing resource metrics are reported as a monitoring failure. These are
two-minute sampled rates, not a daily I/O-credit measurement.
Supabase's own Database Health provides I/O budget.

## Deployment

Run Wrangler from THIS directory: the root is a Next/OpenNext application and
Wrangler's framework detection will otherwise try to deploy the dashboard.
Use the existing repo Wrangler executable or a pinned installed Wrangler.

1. Apply `055_backend_health_snapshot.sql` and `056_backend_cron_retention.sql`.
2. Deploy `backend-health-probe` with JWT verification disabled; its dedicated
   token validation remains mandatory. Configure its monitor secret first.
3. Configure the Worker KV namespace and secrets, deploy, then call `/check`.
4. Verify all probes and an automatic cron invocation.
5. Apply `057_parts_scheduler_to_cloudflare.sql` to deactivate the old parts cron.

Tests: `node --test *.test.mjs` (eleven tests).

## Rollback

Disable the Cloudflare parts schedule before reactivating the database job to
avoid duplicate processing. Reactivate using:

```sql
select cron.alter_job(jobid, active := true)
from cron.job where jobname = 'parts-order-email';
```

Daily retention keeps 14 days of successful and 30 days of failed cron runs.
Active runs and business records are excluded. The one-time cleanup's full
backup is recorded in the operational handoff; do not schedule VACUUM FULL as
routine maintenance. Normal autovacuum reuses the bounded history table.
