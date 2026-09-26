-- Crowdsourced live pin (cup) positions.
--
-- Players near a green submit a cup coordinate (device GPS + optional LiDAR range from Putt View)
-- through report_pin(), which validates participation, proximity and accuracy. A consensus per
-- hole is recomputed on every report and stored in pin_positions, which clients read and
-- subscribe to via Supabase Realtime. Algorithm mirrors supabase/functions/_shared/pins.ts.

create table public.course_greens (
  course_name text     not null,
  hole        smallint not null check (hole between 1 and 18),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  primary key (course_name, hole)
);

create table public.pin_reports (
  id          bigint generated always as identity primary key,
  course_name text     not null,
  hole        smallint not null,
  round_id    uuid     not null references public.rounds (id) on delete cascade,
  user_id     uuid     not null references public.profiles (id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  real     not null check (accuracy_m > 0 and accuracy_m <= 10),
  source      text     not null check (source in ('lidar', 'gps')),
  reported_at timestamptz not null default now(),
  foreign key (course_name, hole) references public.course_greens (course_name, hole)
);
create index pin_reports_recent on public.pin_reports (course_name, hole, reported_at desc);

create table public.pin_positions (
  course_name text     not null,
  hole        smallint not null,
  lat         double precision not null,
  lng         double precision not null,
  reports     int      not null,
  spread_m    real     not null,
  status      text     not null check (status in ('verified', 'provisional')),
  updated_at  timestamptz not null,
  primary key (course_name, hole),
  foreign key (course_name, hole) references public.course_greens (course_name, hole)
);

alter table public.course_greens enable row level security;
alter table public.pin_reports   enable row level security;
alter table public.pin_positions enable row level security;
revoke all on public.course_greens, public.pin_reports, public.pin_positions from anon, authenticated;

-- Course geometry and live pins are shared reference data for signed-in players.
grant select on public.course_greens, public.pin_positions to authenticated;
create policy course_greens_read on public.course_greens for select to authenticated using (true);
create policy pin_positions_read on public.pin_positions for select to authenticated using (true);
-- Raw reports (with user ids and locations) are private: you can see only your own.
grant select on public.pin_reports to authenticated;
create policy pin_reports_own on public.pin_reports for select to authenticated using (user_id = auth.uid());

create function public.geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- Recompute consensus for one hole: newest report per user in the last 10 h → median centre →
-- inliers within 6 m → 1/σ²-weighted mean. Deletes the row when nothing usable remains.
create function public.recompute_pin(p_course text, p_hole int) returns void
language plpgsql security definer set search_path = public as $$
declare
  c_lat double precision; c_lng double precision;
  p_lat double precision; p_lng double precision;
  n int; spread double precision; last_at timestamptz;
begin
  create temp table if not exists _pin_latest (user_id uuid, lat double precision, lng double precision, acc real, at timestamptz) on commit drop;
  truncate _pin_latest;
  insert into _pin_latest
    select distinct on (user_id) user_id, lat, lng, accuracy_m, reported_at
      from public.pin_reports
     where course_name = p_course and hole = p_hole and reported_at > now() - interval '10 hours'
     order by user_id, reported_at desc;

  select percentile_cont(0.5) within group (order by lat), percentile_cont(0.5) within group (order by lng)
    into c_lat, c_lng from _pin_latest;
  if c_lat is null then
    delete from public.pin_positions where course_name = p_course and hole = p_hole;
    return;
  end if;

  delete from _pin_latest where public.geo_distance_m(c_lat, c_lng, lat, lng) > 6;
  select sum(lat / (acc * acc)) / sum(1 / (acc * acc)), sum(lng / (acc * acc)) / sum(1 / (acc * acc)), count(*), max(at)
    into p_lat, p_lng, n, last_at from _pin_latest;
  if n = 0 then
    delete from public.pin_positions where course_name = p_course and hole = p_hole;
    return;
  end if;
  select percentile_disc(0.5) within group (order by public.geo_distance_m(p_lat, p_lng, lat, lng))
    into spread from _pin_latest;

  insert into public.pin_positions (course_name, hole, lat, lng, reports, spread_m, status, updated_at)
  values (p_course, p_hole, p_lat, p_lng, n, spread,
          case when n >= 3 and spread <= 2.5 then 'verified' else 'provisional' end, last_at)
  on conflict (course_name, hole) do update
    set lat = excluded.lat, lng = excluded.lng, reports = excluded.reports, spread_m = excluded.spread_m,
        status = excluded.status, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.recompute_pin(text, int) from public, anon, authenticated;

/**
 * Submit a cup position. Anti-spoofing: caller must be playing an active round on this course,
 * the hole must be in that round, accuracy ≤ 10 m (≤ 1 m for LiDAR), within 45 m of the green
 * centre, and at most one report per user/hole every 2 minutes.
 */
create function public.report_pin(p_round uuid, p_hole int, p_lat double precision, p_lng double precision, p_accuracy real, p_source text)
returns public.pin_positions
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r   public.rounds;
  g   public.course_greens;
  rng record;
  result public.pin_positions;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  select * into r from public.rounds where id = p_round;
  if not found or r.status <> 'active' then raise exception 'round_not_active'; end if;
  if not public.is_round_player(p_round, uid) then raise exception 'not_participant'; end if;
  select * into rng from public.round_hole_range(r.length);
  if p_hole < rng.first_hole or p_hole > rng.last_hole then raise exception 'hole_out_of_range'; end if;
  if p_source not in ('lidar', 'gps') then raise exception 'invalid_source'; end if;
  if p_accuracy is null or p_accuracy <= 0 or p_accuracy > 10 or (p_source = 'lidar' and p_accuracy > 1) then
    raise exception 'accuracy_insufficient';
  end if;

  select * into g from public.course_greens where course_name = r.course_name and hole = p_hole;
  if not found then raise exception 'unknown_green'; end if;
  if public.geo_distance_m(g.lat, g.lng, p_lat, p_lng) > 45 then raise exception 'too_far_from_green'; end if;

  if exists (select 1 from public.pin_reports
              where user_id = uid and course_name = r.course_name and hole = p_hole
                and reported_at > now() - interval '2 minutes') then
    raise exception 'too_frequent';
  end if;

  insert into public.pin_reports (course_name, hole, round_id, user_id, lat, lng, accuracy_m, source)
  values (r.course_name, p_hole, p_round, uid, p_lat, p_lng, p_accuracy, p_source);
  perform public.recompute_pin(r.course_name, p_hole);

  select * into result from public.pin_positions where course_name = r.course_name and hole = p_hole;
  return result;
end;
$$;
revoke all on function public.report_pin(uuid, int, double precision, double precision, real, text) from public, anon;
grant execute on function public.report_pin(uuid, int, double precision, double precision, real, text) to authenticated;

-- Seed green centres for the bundled demo course (same formula as src/data/course.ts greenCenter()).
insert into public.course_greens (course_name, hole, lat, lng)
select 'Somerby Golf Club', h, 52.70 + h * 0.0035, -0.85 + ((h % 3) - 1) * 0.002
from generate_series(1, 18) as h;

-- Live updates to every client following the hole (Supabase Realtime), when available.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pin_positions;
  end if;
end $$;
