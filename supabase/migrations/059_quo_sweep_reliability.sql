-- Recovered from live migration 20260914185402 during the September 22 audit.
-- Reliability layer for the daily Quo -> Salesforce sweep (cron job 2).
-- Problem: quo-activity-log returns HTTP 200 with {"ok":false} on internal
-- failure, so cron.job_run_details records 'succeeded' even when nothing was
-- logged. Days 2026-09-06 and 2026-09-08 were lost this way.

create table if not exists public.quo_sweep_runs (
  id          bigint generated always as identity primary key,
  run_date    date        not null,
  request_id  bigint,
  attempt     int         not null default 1,
  source      text        not null default 'cron',
  posted_at   timestamptz not null default now(),
  checked_at  timestamptz,
  ok          boolean,
  counts      jsonb,
  error       text
);

create unique index if not exists quo_sweep_runs_date_attempt
  on public.quo_sweep_runs (run_date, attempt);
create index if not exists quo_sweep_runs_open
  on public.quo_sweep_runs (checked_at) where checked_at is null;

alter table public.quo_sweep_runs enable row level security;
-- no policies on purpose: service_role / postgres only, same posture as quo_do_not_report

comment on table public.quo_sweep_runs is
  'One row per invocation of the quo-activity-log edge function. ok/counts are '
  'parsed from the RESPONSE BODY, not from cron status, because the function '
  'returns HTTP 200 on internal failure.';

-- Post one sweep for a given date and record the request id.
create or replace function public.quo_sweep_post(
  p_date    date,
  p_attempt int  default 1,
  p_source  text default 'cron',
  p_dry_run boolean default false
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_req bigint;
  v_body jsonb;
begin
  v_body := jsonb_build_object('date', p_date::text);
  if p_dry_run then
    v_body := v_body || jsonb_build_object('dryRun', true);
  end if;

  select net.http_post(
    url := 'https://ikfcnqdrlvhvlyhiuphs.supabase.co/functions/v1/quo-activity-log',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'sf_sync_secret')
    ),
    body := v_body,
    timeout_milliseconds := 90000
  ) into v_req;

  insert into public.quo_sweep_runs (run_date, request_id, attempt, source)
  values (p_date, v_req, p_attempt, p_source)
  on conflict (run_date, attempt)
    do update set request_id = excluded.request_id,
                  posted_at  = now(),
                  checked_at = null,
                  ok = null, counts = null, error = null;

  return v_req;
end;
$fn$;

-- Read the real response body for any unchecked run; retry failures.
create or replace function public.quo_sweep_verify(p_max_attempts int default 4)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r         record;
  v_raw     text;
  v_body    jsonb;
  v_ok      boolean;
  v_counts  jsonb;
  v_err     text;
  v_checked int := 0;
  v_retried int := 0;
  v_failed  int := 0;
begin
  for r in
    select * from public.quo_sweep_runs
    where checked_at is null
      and posted_at < now() - interval '90 seconds'
    order by id
  loop
    v_raw := null; v_body := null;

    select content into v_raw from net._http_response where id = r.request_id;

    if v_raw is null or v_raw = '' then
      v_ok := false; v_counts := null; v_err := 'no response recorded (timeout or purged)';
    else
      begin
        v_body := v_raw::jsonb;
      exception when others then
        v_body := null;
      end;
      if v_body is null then
        v_ok := false; v_counts := null; v_err := 'unparseable response: ' || left(v_raw, 300);
      else
        v_ok     := coalesce((v_body->>'ok')::boolean, false);
        v_counts := v_body->'counts';
        v_err    := left(v_body->>'error', 500);
      end if;
    end if;

    update public.quo_sweep_runs
       set ok = v_ok, counts = v_counts, error = v_err, checked_at = now()
     where id = r.id;
    v_checked := v_checked + 1;

    if not v_ok then
      if r.attempt < p_max_attempts then
        perform public.quo_sweep_post(r.run_date, r.attempt + 1, r.source);
        v_retried := v_retried + 1;
      else
        v_failed := v_failed + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('checked', v_checked, 'retried', v_retried,
                            'exhausted', v_failed, 'at', now());
end;
$fn$;

revoke all on function public.quo_sweep_post(date,int,text,boolean) from public, anon, authenticated;
revoke all on function public.quo_sweep_verify(int) from public, anon, authenticated;;
