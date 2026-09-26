-- Tournament operations: hours of operation, pace settings, the two event phases (Pre-Tournament
-- CRM → Live Event), roster edits, the tee sheet, and geofenced live positions.
--
-- Privacy rules enforced here (not just in the app):
--   * Positions can be written only while the course's tournament is live, only by a player on a
--     registered team for that event, and only inside the course geofence (boundary + 250 ft).
--   * Staff can read positions only while live. Ending the event deletes every position.
--   * Players can always delete their own position (the app's auto-kill switch).

-- ─────────────────────────────────────────────── settings
alter table public.course_settings
  add column pace_min_per_hole numeric(3,1) not null default 14 check (pace_min_per_hole between 10 and 20),
  add column pace_alert_min   smallint not null default 15 check (pace_alert_min between 5 and 45),
  add column course_open      time not null default '06:30',
  add column course_close     time not null default '20:30',
  add column kitchen_open     time not null default '11:00',
  add column kitchen_close    time not null default '21:00',
  add column timezone         text not null default 'America/Chicago',
  add column tournament_live  boolean not null default false,
  add column live_since       timestamptz,
  -- Course boundary box already grown by the 250 ft GPS buffer: {min_lat,min_lng,max_lat,max_lng}.
  add column geofence         jsonb;

grant update (pace_min_per_hole, pace_alert_min, course_open, course_close, kitchen_open, kitchen_close, tournament_live)
  on public.course_settings to authenticated;

-- Open now? Handles hours that run past midnight (close earlier than open).
create function public.is_open(o time, c time, tz text) returns boolean
language sql stable as $$
  select case
    when o = c then false
    when o < c then (now() at time zone tz)::time >= o and (now() at time zone tz)::time < c
    else (now() at time zone tz)::time >= o or (now() at time zone tz)::time < c
  end;
$$;

-- ─────────────────────────────────────────────── pricing: kitchen hours lock food & drink
create or replace function public.price_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; m public.menu_items; q int; total int := 0; mulls int := 0; lim int; bought int;
  s public.course_settings;
begin
  select * into s from public.course_settings where course_name = new.course_name;
  if new.kind = 'hail' then
    if s.course_name is not null and not s.hail_cart then raise exception 'hail_cart_off'; end if;
    new.items := '[]'; new.total_cents := 0;
    return new;
  end if;
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) not between 1 and 20 then raise exception 'invalid_items'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    q := (it ->> 'qty')::int;
    if q is null or q not between 1 and 10 then raise exception 'invalid_qty'; end if;
    select * into m from public.menu_items where sku = it ->> 'sku' and course_name = new.course_name and active;
    if not found then raise exception 'unknown_item'; end if;
    total := total + m.price_cents * q;
    if m.kind = 'charity' then mulls := mulls + q;
    -- Charity mulligans are digital and keep selling when the kitchen/cart is switched off.
    elsif s.course_name is not null and not s.live_ordering then raise exception 'ordering_off';
    elsif m.kind = 'fnb' and s.course_name is not null and not public.is_open(s.kitchen_open, s.kitchen_close, s.timezone) then
      raise exception 'kitchen_closed'; -- no ghost orders after hours
    end if;
  end loop;
  if mulls > 0 then
    lim := coalesce(s.mulligan_limit, 4);
    select coalesce(sum((e ->> 'qty')::int), 0) into bought
      from public.orders o, jsonb_array_elements(o.items) e
      join public.menu_items mi on mi.sku = e ->> 'sku' and mi.kind = 'charity'
     where o.player_id = new.player_id and o.course_name = new.course_name and o.created_at > now() - interval '18 hours';
    if bought + mulls > lim then raise exception 'mulligan_limit'; end if;
  end if;
  new.total_cents := total;  -- never trust a client-sent total
  new.status := case when mulls > 0 and mulls = (select sum((e ->> 'qty')::int) from jsonb_array_elements(new.items) e) then 'delivered' else 'new' end;
  return new;
end;
$$;

-- ─────────────────────────────────────────────── event phases
-- live_since follows the switch; ending the event wipes every stored position for the course.
create function public.on_live_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tournament_live is distinct from old.tournament_live then
    new.live_since := case when new.tournament_live then now() end;
    if not new.tournament_live then
      delete from public.live_positions lp using public.events e where e.id = lp.event_id and e.course_name = new.course_name;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ─────────────────────────────────────────────── registrations: open slots, balances, edits
-- A slot is either a verified contact or entirely empty (a drop-out not yet replaced).
create or replace function public.valid_roster(r jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(r) = 'array' and jsonb_array_length(r) = 3 and not exists (
    select 1 from jsonb_array_elements(r) p
    where concat(p ->> 'first', p ->> 'last', p ->> 'phone', p ->> 'email') <> '' and (
         coalesce(char_length(p ->> 'first'), 0) not between 1 and 40
      or coalesce(char_length(p ->> 'last'), 0) not between 1 and 40
      or coalesce(p ->> 'phone', '') !~ '^\+\d{8,15}$'
      or coalesce(p ->> 'email', '') !~* '^[^\s@<>]{1,64}@[^\s@<>]{1,255}\.[a-z]{2,}$'
      or concat(p ->> 'first', p ->> 'last') ~ '[<>]')
  );
$$;

alter table public.registrations
  add column total_cents int not null default 0 check (total_cents >= 0),
  add column paid_cents  int not null default 0 check (paid_cents >= 0);

-- Rosters are editable by the captain until the event starts; by the course's staff any time.
create function public.event_editable(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e left join public.course_settings s on s.course_name = e.course_name
    where e.id = ev and e.starts_at > now() and not coalesce(s.tournament_live, false)
  );
$$;
create function public.event_course(ev uuid) returns text
language sql stable security definer set search_path = public as $$ select course_name from public.events where id = ev $$;

grant update (team_name, roster) on public.registrations to authenticated;
create policy reg_captain_edit on public.registrations for update to authenticated
  using (captain_id = auth.uid() and public.event_editable(event_id))
  with check (captain_id = auth.uid() and public.event_editable(event_id));
create policy reg_staff_edit on public.registrations for update to authenticated
  using (public.is_staff(public.event_course(event_id))) with check (public.is_staff(public.event_course(event_id)));
-- (paid / paid_cents stay service-role only: the payment webhook records money, never a client.)

-- ─────────────────────────────────────────────── tee sheet (staff only)
create table public.tee_times (
  id          uuid primary key default gen_random_uuid(),
  course_name text not null,
  starts_at   timestamptz not null,
  status      text not null check (status in ('reserved', 'blocked')),
  name        text not null check (char_length(name) between 1 and 40 and name !~ '[<>]'),
  party_size  smallint not null default 0 check (party_size between 0 and 4),
  phone       text check (phone ~ '^\+\d{8,15}$'),
  email       text check (email ~* '^[^\s@<>]{1,64}@[^\s@<>]{1,255}\.[a-z]{2,}$'),
  source      text not null default 'phone' check (source in ('phone', 'walkup', 'app', 'staff')),
  note        text check (char_length(note) <= 80),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (course_name, starts_at),
  check (status = 'blocked' or (party_size between 1 and 4 and phone is not null))
);
alter table public.tee_times enable row level security;
grant select, insert, update, delete on public.tee_times to authenticated;
create policy tee_staff on public.tee_times for all to authenticated
  using (public.is_staff(course_name)) with check (public.is_staff(course_name));

-- ─────────────────────────────────────────────── live positions (geofenced)
create table public.live_positions (
  player_id  uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  updated_at timestamptz not null default now()
);

-- May this player broadcast this fix? Live event + on a registered team + inside the geofence.
create function public.position_allowed(ev uuid, plat double precision, plng double precision) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from public.events e
    join public.course_settings s on s.course_name = e.course_name
    where e.id = ev
      and s.tournament_live
      and s.geofence is not null
      and plat between (s.geofence ->> 'min_lat')::float8 and (s.geofence ->> 'max_lat')::float8
      and plng between (s.geofence ->> 'min_lng')::float8 and (s.geofence ->> 'max_lng')::float8
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

alter table public.live_positions enable row level security;
grant select, insert, update (lat, lng, updated_at, event_id), delete on public.live_positions to authenticated;
create policy pos_insert on public.live_positions for insert to authenticated
  with check (player_id = auth.uid() and public.position_allowed(event_id, lat, lng));
create policy pos_update on public.live_positions for update to authenticated
  using (player_id = auth.uid()) with check (player_id = auth.uid() and public.position_allowed(event_id, lat, lng));
create policy pos_delete on public.live_positions for delete to authenticated using (player_id = auth.uid()); -- kill switch
create policy pos_staff_read on public.live_positions for select to authenticated using (
  player_id = auth.uid() or (
    public.is_staff(public.event_course(event_id))
    and exists (select 1 from public.course_settings s where s.course_name = public.event_course(event_id) and s.tournament_live)
  )
);

create trigger course_settings_live before update on public.course_settings
  for each row execute function public.on_live_change();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_positions, public.tee_times;
  end if;
end $$;

-- Somerby property box (hole hull + 250 ft), matching src/lib/geofence.ts bufferedBox().
update public.course_settings
   set geofence = '{"min_lat": 44.04202, "min_lng": -92.64430, "max_lat": 44.05304, "max_lng": -92.62787}'
 where course_name = 'Somerby Golf Club';
