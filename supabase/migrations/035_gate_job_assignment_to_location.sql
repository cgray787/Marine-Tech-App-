-- 035_gate_job_assignment_to_location.sql
-- Expansion-runbook gap 5: jobs.assigned_to wasn't gated to the job's office.
-- A manager who knew a profile id could assign a Seattle job to a Sausalito
-- tech — who could then never see it (reads are location-scoped), leaving a
-- phantom assignment. Enforce at the database via a BEFORE trigger so every
-- write path (web, mobile, offline sync replay, raw REST) is covered.
--
-- Rules:
--   * assigned_to NULL                  -> allowed (unassigned)
--   * assignee role = 'admin'           -> allowed (org-wide visibility)
--   * job has no customer               -> allowed (no office to mismatch)
--   * customer has no location          -> allowed (individual-tier data)
--   * otherwise assignee.location_id must equal the customer's location_id

create or replace function public.enforce_job_assignee_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee_role text;
  v_assignee_loc  uuid;
  v_customer_loc  uuid;
begin
  if new.assigned_to is null then
    return new;
  end if;

  select role, location_id
    into v_assignee_role, v_assignee_loc
    from public.profiles
   where id = new.assigned_to;

  if not found then
    raise exception 'assigned_to profile % does not exist', new.assigned_to;
  end if;

  if v_assignee_role = 'admin' then
    return new;
  end if;

  if new.customer_id is null then
    return new;
  end if;

  select location_id
    into v_customer_loc
    from public.customers
   where id = new.customer_id;

  if v_customer_loc is null then
    return new;
  end if;

  if v_assignee_loc is distinct from v_customer_loc then
    raise exception 'cannot assign this job to a technician from another office'
      using errcode = 'check_violation',
            hint    = 'The assignee must belong to the same location as the job''s customer.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_job_assignee_location() from public, anon;

drop trigger if exists job_assignee_location on public.jobs;
create trigger job_assignee_location
  before insert or update of assigned_to, customer_id on public.jobs
  for each row execute function public.enforce_job_assignee_location();
