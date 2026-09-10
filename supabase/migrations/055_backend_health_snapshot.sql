-- Aggregate operational metrics only. Called by the authenticated health-probe
-- Edge Function, never by an application user or an anonymous REST caller.
create or replace function public.backend_health_snapshot()
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'checked_at', now(),
    'database_bytes', pg_database_size(current_database()),
    'wal_bytes', (select coalesce(sum(size), 0) from pg_ls_waldir()),
    'read_only', current_setting('default_transaction_read_only') = 'on',
    'archive_failed_count', (select failed_count from pg_stat_archiver),
    'last_archived_at', (select last_archived_time from pg_stat_archiver),
    'last_archive_failure_at', (select last_failed_time from pg_stat_archiver)
  );
$$;

revoke all on function public.backend_health_snapshot() from public, anon, authenticated;
grant execute on function public.backend_health_snapshot() to service_role;
