-- Tee-time booking & pricing.
--
--   * Staff publish rate bands (time of day × weekday/weekend × 18/9 holes), cart fees (per golfer
--     or per reservation), booking rules and course policies. Everyone signed in can read them
--     (the golfer app shows them live via Realtime).
--   * Golfers never write tee_times directly: book_tee_time() validates the slot (course hours,
--     interval, booking window, blocks, walking rule, per-golfer limit), computes the price with
--     tee_quote() and inserts the reservation. cancel_tee_time() honours the cancellation window.
--   * tee_availability() exposes which slots are taken/blocked WITHOUT other golfers' names.

create table public.tee_pricing (
  course_name         text primary key,
  cart_mode           text not null default 'per-golfer' check (cart_mode in ('per-golfer', 'per-reservation')),
  cart18_cents        int  not null default 2000 check (cart18_cents between 0 and 100000),
  cart9_cents         int  not null default 1200 check (cart9_cents between 0 and 100000),
  walking             boolean not null default true,
  interval_min        smallint not null default 10 check (interval_min in (5, 7, 8, 9, 10, 12, 15, 20)),
  booking_window_days smallint not null default 14 check (booking_window_days between 1 and 60),
  cancel_hours        smallint not null default 24 check (cancel_hours between 0 and 168),
  max_upcoming        smallint not null default 3 check (max_upcoming between 1 and 10),
  cancellation_policy text not null default '' check (char_length(cancellation_policy) <= 600 and cancellation_policy !~ '[<>]'),
  rules               text not null default '' check (char_length(rules) <= 800 and rules !~ '[<>]'),
  dress_code          text not null default '' check (char_length(dress_code) <= 300 and dress_code !~ '[<>]'),
  updated_at          timestamptz not null default now(),
  updated_by          uuid default auth.uid()
);

create table public.tee_rate_bands (
  id            uuid primary key default gen_random_uuid(),
  course_name   text not null references public.tee_pricing (course_name) on delete cascade,
  label         text not null check (char_length(label) between 1 and 30 and label !~ '[<>]'),
  from_time     time not null,
  weekday18_cents int not null check (weekday18_cents between 0 and 100000),
  weekday9_cents  int not null check (weekday9_cents between 0 and 100000),
  weekend18_cents int not null check (weekend18_cents between 0 and 100000),
  weekend9_cents  int not null check (weekend9_cents between 0 and 100000),
  unique (course_name, from_time)
);

alter table public.tee_pricing enable row level security;
alter table public.tee_rate_bands enable row level security;
revoke all on public.tee_pricing, public.tee_rate_bands from anon, authenticated;
grant select on public.tee_pricing, public.tee_rate_bands to authenticated;
grant update (cart_mode, cart18_cents, cart9_cents, walking, interval_min, booking_window_days, cancel_hours, max_upcoming,
              cancellation_policy, rules, dress_code, updated_at) on public.tee_pricing to authenticated;
grant insert (course_name, label, from_time, weekday18_cents, weekday9_cents, weekend18_cents, weekend9_cents),
      update (label, from_time, weekday18_cents, weekday9_cents, weekend18_cents, weekend9_cents), delete on public.tee_rate_bands to authenticated;
create policy pricing_read on public.tee_pricing for select to authenticated using (true);
create policy pricing_staff on public.tee_pricing for update to authenticated using (public.is_staff(course_name)) with check (public.is_staff(course_name));
create policy bands_read on public.tee_rate_bands for select to authenticated using (true);
create policy bands_staff_ins on public.tee_rate_bands for insert to authenticated with check (public.is_staff(course_name));
create policy bands_staff_upd on public.tee_rate_bands for update to authenticated using (public.is_staff(course_name)) with check (public.is_staff(course_name));
create policy bands_staff_del on public.tee_rate_bands for delete to authenticated using (public.is_staff(course_name));

-- App reservations: who booked, what they booked, and the price quoted by the server.
alter table public.tee_times
  add column golfer_id   uuid references public.profiles (id) on delete set null,
  add column holes       text check (holes in ('18', 'front9', 'back9')),
  add column transport   text check (transport in ('walk', 'ride')),
  add column total_cents int check (total_cents between 0 and 1000000);
create policy tee_golfer_read on public.tee_times for select to authenticated using (golfer_id = auth.uid());

-- Price in cents for a tee time (course-local weekday/weekend and time-of-day band).
create function public.tee_quote(course text, at timestamptz, holes text, transport text, players int) returns int
language plpgsql stable security definer set search_path = public as $$
declare tz text; lt timestamp; b public.tee_rate_bands; p public.tee_pricing; weekend boolean; nine boolean; green int; cart int := 0;
begin
  if players not between 1 and 4 or holes not in ('18', 'front9', 'back9') or transport not in ('walk', 'ride') then raise exception 'invalid_quote'; end if;
  select * into p from public.tee_pricing where course_name = course;
  if not found then raise exception 'no_pricing'; end if;
  select coalesce(timezone, 'America/Chicago') into tz from public.course_settings where course_name = course;
  lt := at at time zone coalesce(tz, 'America/Chicago');
  select * into b from public.tee_rate_bands where course_name = course and from_time <= lt::time order by from_time desc limit 1;
  if not found then select * into b from public.tee_rate_bands where course_name = course order by from_time limit 1; end if;
  if not found then raise exception 'no_pricing'; end if;
  weekend := extract(isodow from lt) in (6, 7);
  nine := holes <> '18';
  green := case when weekend then (case when nine then b.weekend9_cents else b.weekend18_cents end)
                else (case when nine then b.weekday9_cents else b.weekday18_cents end) end;
  if transport = 'ride' then
    cart := case when nine then p.cart9_cents else p.cart18_cents end;
    if p.cart_mode = 'per-golfer' then cart := cart * players; end if;
  end if;
  return green * players + cart;
end;
$$;
grant execute on function public.tee_quote(text, timestamptz, text, text, int) to authenticated;

-- Which slots on a day are taken or blocked — no names, phones or emails.
create function public.tee_availability(course text, day date)
returns table (starts_at timestamptz, status text, reason text)
language sql stable security definer set search_path = public as $$
  select t.starts_at, 'taken', null::text from public.tee_times t
   join public.course_settings c on c.course_name = t.course_name
   where t.course_name = course and (t.starts_at at time zone c.timezone)::date = day
  union all
  select null, 'blocked', b.reason || coalesce(' ' || b.from_time::text || '-' || b.to_time::text, ' all-day') from public.tee_blocks b
   where b.course_name = course and day between b.start_date and b.end_date;
$$;
grant execute on function public.tee_availability(text, date) to authenticated;

create function public.book_tee_time(course text, at timestamptz, holes text, transport text, players int)
returns table (id uuid, total_cents int)
language plpgsql security definer set search_path = public, auth as $$
declare p public.tee_pricing; c public.course_settings; lt timestamp; mins int; open_m int; close_m int; ph text; nm text; new_id uuid; price int;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  select * into p from public.tee_pricing where course_name = course;
  select * into c from public.course_settings where course_name = course;
  if p.course_name is null or c.course_name is null then raise exception 'unknown_course'; end if;
  if at < now() then raise exception 'tee_time_past'; end if;
  if at > now() + make_interval(days => p.booking_window_days + 1) then raise exception 'outside_booking_window'; end if;
  lt := at at time zone c.timezone;
  mins := extract(hour from lt)::int * 60 + extract(minute from lt)::int;
  open_m := extract(hour from c.course_open)::int * 60 + extract(minute from c.course_open)::int;
  close_m := extract(hour from c.course_close)::int * 60 + extract(minute from c.course_close)::int;
  if extract(second from lt) <> 0 or mins < open_m or mins >= close_m or (mins - open_m) % p.interval_min <> 0 then raise exception 'not_a_tee_time'; end if;
  if transport = 'walk' and not p.walking then raise exception 'carts_required'; end if;
  if (select count(*) from public.tee_times t where t.golfer_id = auth.uid() and t.starts_at >= now()) >= p.max_upcoming then raise exception 'too_many_reservations'; end if;
  select u.phone into ph from auth.users u where u.id = auth.uid();
  if ph is null then raise exception 'phone_required'; end if;
  if ph !~ '^\+' then ph := '+' || ph; end if;
  select left(display_name, 40) into nm from public.profiles where profiles.id = auth.uid();
  price := public.tee_quote(course, at, holes, transport, players);
  begin
    insert into public.tee_times (course_name, starts_at, status, name, party_size, phone, source, golfer_id, holes, transport, total_cents)
    values (course, at, 'reserved', regexp_replace(coalesce(nm, 'Golfer'), '[<>]', '', 'g'), players, ph, 'app', auth.uid(), holes, transport, price)
    returning tee_times.id into new_id;
  exception when unique_violation then raise exception 'tee_time_taken';
  end;
  return query select new_id, price;
end;
$$;
grant execute on function public.book_tee_time(text, timestamptz, text, text, int) to authenticated;

create function public.cancel_tee_time(tee uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tee_times; p public.tee_pricing;
begin
  select * into t from public.tee_times where id = tee and golfer_id = auth.uid() and source = 'app';
  if not found then raise exception 'not_your_reservation'; end if;
  select * into p from public.tee_pricing where course_name = t.course_name;
  if t.starts_at - now() < make_interval(hours => p.cancel_hours) then raise exception 'inside_cancellation_window'; end if;
  delete from public.tee_times where id = tee;
end;
$$;
grant execute on function public.cancel_tee_time(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tee_pricing, public.tee_rate_bands;
  end if;
end $$;

-- Seed for the bundled course.
insert into public.tee_pricing (course_name, cancellation_policy, rules, dress_code) values ('Somerby Golf Club',
  'Cancel at least 24 hours before your tee time at no charge. Later cancellations and no-shows may be charged the full green fee.',
  'Please arrive 15 minutes before your tee time and check in at the pro shop. Keep carts 90° on fairways and off tees and greens.',
  'Collared shirts required. No denim, tank tops or metal spikes.');
insert into public.tee_rate_bands (course_name, label, from_time, weekday18_cents, weekday9_cents, weekend18_cents, weekend9_cents) values
  ('Somerby Golf Club', 'Morning', '06:30', 5200, 3000, 6400, 3600),
  ('Somerby Golf Club', 'Midday', '11:00', 4600, 2700, 5800, 3300),
  ('Somerby Golf Club', 'Twilight', '15:30', 3400, 2200, 4000, 2500);
