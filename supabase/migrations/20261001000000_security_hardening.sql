-- Security hardening from the audit + fault-tolerance and support features.
--
--  1. Orders: players can undo (cancel) their own order for 2 minutes; open-order spam limits;
--     orders only for known courses.
--  2. Geofence: exact course polygon + 250 ft buffer on the server (was a bounding box), plus
--     plausibility checks on live positions (accuracy, update rate, speed, event window).
--  3. Support tickets with RLS, size limits and rate limiting.

-- ─────────────────────────────────────────────── 1. orders
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('new', 'enroute', 'completed', 'cancelled'));

-- Player "Undo": only their own, only while still new, only within 2 minutes, only to cancelled.
create policy orders_player_cancel on public.orders for update to authenticated
  using (player_id = auth.uid() and status = 'new' and created_at > now() - interval '2 minutes')
  with check (player_id = auth.uid() and status = 'cancelled');

create function public.limit_open_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare open_orders int; open_hails int;
begin
  if not exists (select 1 from public.course_settings where course_name = new.course_name) then
    raise exception 'unknown_course';
  end if;
  select count(*) filter (where kind = 'order'), count(*) filter (where kind = 'hail')
    into open_orders, open_hails
    from public.orders where player_id = new.player_id and status in ('new', 'enroute');
  if new.kind = 'hail' and open_hails > 0 then raise exception 'hail_already_open'; end if;
  if new.kind = 'order' and open_orders >= 5 then raise exception 'too_many_open_orders'; end if;
  return new;
end;
$$;
create trigger orders_limit before insert on public.orders for each row execute function public.limit_open_orders();

-- ─────────────────────────────────────────────── 2. geofence polygon + plausibility
alter table public.course_settings add column geofence_polygon jsonb
  check (geofence_polygon is null or (jsonb_typeof(geofence_polygon) = 'array' and jsonb_array_length(geofence_polygon) between 3 and 200));

-- Inside the course polygon, or within 76.2 m (250 ft) of its edge. Local equirectangular metres.
create function public.on_property(course text, plat double precision, plng double precision) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  s public.course_settings; poly jsonb; n int; i int; j int;
  lat0 double precision; kx double precision; ky double precision := 110540;
  px double precision; py double precision; ax double precision; ay double precision; bx double precision; by_ double precision;
  inside boolean := false; best double precision := 1e12; t double precision; dx double precision; dy double precision;
begin
  select * into s from public.course_settings where course_name = course;
  if s.geofence is null then return false; end if;
  -- cheap prefilter: the buffered bounding box
  if plat not between (s.geofence ->> 'min_lat')::float8 and (s.geofence ->> 'max_lat')::float8
     or plng not between (s.geofence ->> 'min_lng')::float8 and (s.geofence ->> 'max_lng')::float8 then
    return false;
  end if;
  poly := s.geofence_polygon;
  if poly is null then return true; end if; -- no polygon configured: box only
  n := jsonb_array_length(poly);
  lat0 := (poly -> 0 ->> 0)::float8;
  kx := 111320 * cos(radians(lat0));
  px := (plng - (poly -> 0 ->> 1)::float8) * kx;
  py := (plat - lat0) * ky;
  j := n - 1;
  for i in 0 .. n - 1 loop
    ax := ((poly -> i ->> 1)::float8 - (poly -> 0 ->> 1)::float8) * kx;  ay := ((poly -> i ->> 0)::float8 - lat0) * ky;
    bx := ((poly -> j ->> 1)::float8 - (poly -> 0 ->> 1)::float8) * kx;  by_ := ((poly -> j ->> 0)::float8 - lat0) * ky;
    if ((ay > py) <> (by_ > py)) and (px < (bx - ax) * (py - ay) / (by_ - ay) + ax) then inside := not inside; end if;
    dx := bx - ax; dy := by_ - ay;
    t := case when dx = 0 and dy = 0 then 0 else greatest(0, least(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) end;
    best := least(best, sqrt((px - (ax + t * dx)) ^ 2 + (py - (ay + t * dy)) ^ 2));
    j := i;
  end loop;
  return inside or best <= 76.2;
end;
$$;

create or replace function public.position_allowed(ev uuid, plat double precision, plng double precision) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from public.events e
    join public.course_settings s on s.course_name = e.course_name
    where e.id = ev
      and s.tournament_live
      and s.live_since > now() - interval '12 hours'          -- scheduled event window only
      and public.on_property(e.course_name, plat, plng)
      and exists (
        select 1 from public.registrations r
        where r.event_id = e.id and (
          r.captain_id = auth.uid()
          or exists (
            select 1 from jsonb_array_elements(r.roster) p, auth.users u
            where u.id = auth.uid() and u.phone is not null
              and regexp_replace(p ->> 'phone', '\D', '', 'g') = regexp_replace(u.phone, '\D', '', 'g')
          )
        )
      )
  );
$$;

alter table public.live_positions add column accuracy_m real check (accuracy_m is null or accuracy_m between 0 and 100);
grant update (accuracy_m) on public.live_positions to authenticated;
grant insert (event_id, lat, lng, accuracy_m) on public.live_positions to authenticated;

-- Anti-spoofing plausibility: no faster than one fix per 3 s, no teleporting (> 25 m/s ≈ 56 mph).
create function public.check_position() returns trigger
language plpgsql as $$
declare dt double precision; dist double precision;
begin
  -- Only an actual position change is rate/speed checked (and re-stamped).
  if tg_op = 'UPDATE' and new.lat = old.lat and new.lng = old.lng then return new; end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    dt := extract(epoch from (now() - old.updated_at));
    if dt < 3 then raise exception 'position_too_frequent'; end if;
    dist := sqrt(((new.lat - old.lat) * 110540) ^ 2 + ((new.lng - old.lng) * 111320 * cos(radians(new.lat))) ^ 2);
    if dist / dt > 25 then raise exception 'position_implausible'; end if;
  end if;
  return new;
end;
$$;
create trigger live_positions_check before insert or update on public.live_positions
  for each row execute function public.check_position();

-- Data retention: positions never outlive the event day, even if staff forget to end the event.
create function public.purge_stale_positions() returns int
language sql security definer set search_path = public as $$
  with gone as (
    delete from public.live_positions lp
     using public.events e, public.course_settings s
     where e.id = lp.event_id and s.course_name = e.course_name
       and (not s.tournament_live
            or lp.updated_at < now() - interval '12 hours'
            or (lp.updated_at at time zone s.timezone)::date < (now() at time zone s.timezone)::date)
    returning 1)
  select count(*)::int from gone;
$$;
revoke all on function public.purge_stale_positions() from public, anon, authenticated;
do $$
begin
  -- Hosted Supabase: run the purge every 15 minutes with pg_cron when it's enabled.
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-stale-positions', '*/15 * * * *', 'select public.purge_stale_positions()');
  end if;
end $$;

update public.course_settings set geofence_polygon = '[[44.050492,-92.643351],[44.045852,-92.6417],[44.043292,-92.63714],[44.042709,-92.635664],[44.042725,-92.630245],[44.043873,-92.628823],[44.051706,-92.63032],[44.051994,-92.631061],[44.052355,-92.637966]]'
 where course_name = 'Somerby Golf Club';

-- ─────────────────────────────────────────────── 3. support tickets
create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_name     text,
  category        text not null check (category in ('GPS Tracking', 'Scorecard', 'F&B Ordering', 'App Crash', 'Other')),
  description     text not null check (char_length(description) between 10 and 2000 and description !~ '[<>]'),
  contact         text check (char_length(contact) <= 120),
  -- Storage key of the re-encoded JPEG screenshot (bucket "support-screenshots", private).
  screenshot_path text check (screenshot_path ~ '^[a-z0-9/_-]{1,200}\.jpg$'),
  diagnostics     jsonb not null default '{}' check (jsonb_typeof(diagnostics) = 'object' and octet_length(diagnostics::text) <= 12000),
  status          text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
  note            text check (char_length(note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
-- Reporters can't set status/note; staff can only change status/note.
grant select, insert (course_name, category, description, contact, screenshot_path, diagnostics) on public.support_tickets to authenticated;
grant update (status, note) on public.support_tickets to authenticated;
create policy tickets_insert on public.support_tickets for insert to authenticated with check (reporter_id = auth.uid());
create policy tickets_read on public.support_tickets for select to authenticated using (reporter_id = auth.uid() or public.is_staff(course_name));
create policy tickets_staff on public.support_tickets for update to authenticated
  using (public.is_staff(course_name)) with check (public.is_staff(course_name));

create function public.limit_tickets() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.support_tickets where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'ticket_rate_limited';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger support_tickets_limit before insert on public.support_tickets for each row execute function public.limit_tickets();

-- ─────────────────────────────────────────────── 4. event-day check-in (staff only)
alter table public.registrations add column checked_in_at timestamptz;
grant update (checked_in_at) on public.registrations to authenticated;
-- Captains may update their own row (roster edits), so guard this column explicitly.
create function public.guard_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.checked_in_at is distinct from old.checked_in_at and not public.is_staff(public.event_course(new.event_id)) then
    raise exception 'staff_only';
  end if;
  return new;
end;
$$;
create trigger registrations_checkin before update on public.registrations for each row execute function public.guard_checkin();
