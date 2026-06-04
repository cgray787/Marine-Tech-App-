-- 019_boats_engine_hours.sql
-- Adds per-engine hour readings to boats. Both nullable; numeric to allow
-- tenths (engine-hour meters typically read to 0.1 hr). Single-engine boats
-- use the port column only; the UI shows a single unlabeled value when just
-- one is set. No RLS changes — existing boat policies are column-agnostic.

alter table public.boats
  add column if not exists engine_hours_port numeric,
  add column if not exists engine_hours_starboard numeric;

comment on column public.boats.engine_hours_port is 'Port (or sole) engine hour-meter reading';
comment on column public.boats.engine_hours_starboard is 'Starboard engine hour-meter reading (twin-engine boats)';
