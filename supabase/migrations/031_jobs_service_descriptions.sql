-- 031_jobs_service_descriptions.sql
-- Per-service detailed descriptions on a job. The Create Job form has toggles
-- like Engine / Electrical / Hull & Bottom / etc. — operators want to type a
-- specific note per area without overwriting another tech's notes. JSONB
-- keyed by the service-type string (matches values from `jobs.service_types`),
-- e.g. {"Engine Service": "Replace zincs", "Electrical": "Diag nav lights"}.
--
-- Default empty object so the column never needs to be NULL-checked by app code.
--
-- Applied via Supabase MCP on 2026-06-08; this file backfills the schema-as-code
-- so `supabase db reset` / fresh-environment bring-ups stay reproducible.

alter table public.jobs
  add column if not exists service_descriptions jsonb not null default '{}'::jsonb;

comment on column public.jobs.service_descriptions is
  'Per-service detailed description, keyed by service_types entry. Edited in the dashboard Create Job + Job Editor forms and the mobile new-job form.';
