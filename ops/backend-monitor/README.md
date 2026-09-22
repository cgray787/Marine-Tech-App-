# Marine Tech external monitor

Status: prepared locally; email destination and deployment are pending.

Runs on Cloudflare independently of Supabase. Checks Auth, REST, the web login
page, and a token-protected Edge Function every five minutes. The function can
read only aggregate operational metrics through a service-role-only SQL RPC;
the external Worker holds no Supabase account or service-role credentials.

Alerts after two consecutive failed checks, repeats hourly while unhealthy,
and sends one recovery email. Capacity alerts cover WAL above 4 GiB, combined
database/WAL above 12 GiB, read-only mode, and the most recent archival attempt
failing. Combined database/WAL size excludes other filesystem contents; this
is not a complete filesystem utilization or daily disk I/O budget monitor.

Deployment:

1. Apply `052_backend_health_snapshot.sql` through the Management API migration endpoint.
2. Generate a dedicated `BACKEND_MONITOR_TOKEN`; store it as a Supabase Function
   secret and a Cloudflare Worker secret. Do not put it in the repository.
3. Deploy only `backend-health-probe` with `--no-verify-jwt --use-api`. The
   function validates its dedicated token before querying the database.
4. Configure a separate `marine-tech-backend-monitor` Worker with `worker.mjs`
   as its entrypoint, a five-minute cron, and a KV binding called `STATE`.
5. Configure `SUPABASE_URL`, the public `SUPABASE_PUBLIC_KEY`, and confirmed
   `ALERT_TO`. Restrict the `ALERT_EMAIL` send-email binding to that address.
   Cloudflare requires a verified sending domain and destination address.
6. Add a separate random `MONITOR_ADMIN_TOKEN` Worker secret. It protects
   `/check`, `/test-email`, and `/status`; it grants no database access.
7. Test unauthorized probes, authenticated metrics, a manual `/check`, and one
   test email before considering delivery enabled. Verify the next cron run.

Run the incident and alert-state regression checks:

```sh
node --test ops/backend-monitor/checks.test.mjs
```

Scheduled probes use only reads. Diagnostic emails contain service names,
aggregate capacity and timestamps, never customer records or credentials.
