-- Audit reproduced two gaps using authenticated, rolled-back transactions:
-- a tech could move their own office, and a disabled tech could still write.
create or replace function public.profile_is_active() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where auth_id = auth.uid() and status = 'active'); $$;
revoke all on function public.profile_is_active() from public, anon;
grant execute on function public.profile_is_active() to authenticated, service_role;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where auth_id = auth.uid() and role = 'admin' and status = 'active'); $$;

create or replace function public.profile_can_write() returns boolean
language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.profiles where auth_id = auth.uid() and status = 'active' and role in ('admin','manager','tech','owner')); $$;

-- Profile reads remain available for the UI's disabled-account message. Profile
-- identity, privileges and office assignment can only be changed by active
-- admins or trusted backend operations, never by a self-service profile edit.
create or replace function public.protect_profile_access_fields() returns trigger
language plpgsql set search_path = public, auth as $$
begin
  if current_user = 'authenticated' and not public.is_admin() and
     row(new.auth_id,new.email,new.role,new.tier,new.status,new.org_id,new.location_id)
       is distinct from row(old.auth_id,old.email,old.role,old.tier,old.status,old.org_id,old.location_id) then
    raise exception 'Only an active administrator can change account access or office assignment' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_access_fields on public.profiles;
create trigger protect_profile_access_fields before update on public.profiles
for each row execute function public.protect_profile_access_fields();

-- AND with existing office/ownership policies; never broaden their scope.
do $$ declare t text; begin
  foreach t in array array['customers','boats','jobs','marinas','service_reports','pdi_reports',
    'report_photos','checklist_items','pdi_checklist_items','parts','service_campaigns','campaign_log',
    'work_orders','work_order_jobs','work_order_lines','work_order_payments','price_levels','job_templates','wo_settings','notifications','invites'] loop
    execute format('drop policy if exists active_account_required on public.%I', t);
    execute format('create policy active_account_required on public.%I as restrictive for all to authenticated using (public.profile_is_active()) with check (public.profile_is_active())', t);
  end loop;
end $$;
