-- Run through an administrative SQL connection. Every test change is rolled back.
begin;
select set_config('request.jwt.claim.sub',(select auth_id::text from profiles where role='tech' and status='active' and location_id is not null limit 1),true);
set local role authenticated;
do $$ begin
  begin
    update profiles set location_id=(select id from locations where id is distinct from profiles.location_id limit 1) where auth_id=auth.uid();
    raise exception 'Audit failed: self-office change was allowed';
  exception when insufficient_privilege then null; end;
  if not public.profile_can_write() then raise exception 'Active tech write permission regressed'; end if;
end $$;
reset role;
update profiles set status='disabled' where auth_id=auth.uid();
set local role authenticated;
do $$ begin
  if public.profile_can_write() then raise exception 'Disabled account still writable'; end if;
  if exists(select 1 from jobs) then raise exception 'Disabled account can still read jobs'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','ec4c6451-623a-4a41-9dde-0cd48afc767d',true);
set local role authenticated;
do $$ declare r uuid; p uuid; begin
  insert into pdi_reports(tech_id,boat_name,owner_name) values(public.current_profile_id(),'Audit rollback vessel','Audit rollback owner') returning id into r;
  insert into report_photos(pdi_report_id,photo_url,category) values(r,'https://example.invalid/audit-photo.jpg','audit') returning id into p;
  if not exists(select 1 from report_photos where id=p and pdi_report_id=r) then raise exception 'PDI photo not readable'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select auth_id::text from profiles where role='tech' and status='active' and location_id is not null limit 1),true);
set local role authenticated;
do $$ begin
  update profiles set full_name=full_name where auth_id=auth.uid();
  if exists(select 1 from customers where location_id is distinct from public.current_profile_location()) then
    raise exception 'Tech office isolation failed';
  end if;
end $$;
reset role;
update profiles set role='viewer' where auth_id=auth.uid();
set local role authenticated;
do $$ begin
  if public.profile_can_write() then raise exception 'Viewer has write permission'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','ec4c6451-623a-4a41-9dde-0cd48afc767d',true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from jobs) then raise exception 'Admin cannot read jobs'; end if;
end $$;

select 'passed' as transactional_migration_checks;
rollback;
