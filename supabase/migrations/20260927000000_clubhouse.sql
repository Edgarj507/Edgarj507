-- Clubhouse OS: staff roles, course-wide switches, tournament registrations, on-course commerce.
--
-- RBAC is enforced here, not in the app: staff powers come only from rows in staff_members (which
-- clients cannot write), and every table is behind RLS. Prices are computed server-side from
-- menu_items; clients only send SKUs and quantities.

create table public.staff_members (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  course_name text not null,
  role        text not null check (role in ('staff', 'organizer', 'admin')),
  created_at  timestamptz not null default now(),
  primary key (user_id, course_name)
);

create function public.is_staff(course text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid() and course_name = course);
$$;

create table public.course_settings (
  course_name    text primary key,
  live_ordering  boolean not null default true,
  hail_cart      boolean not null default true,
  mulligan_limit smallint not null default 4 check (mulligan_limit between 0 and 10),
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

create table public.menu_items (
  sku         text primary key check (sku ~ '^[A-Z0-9_]{2,32}$'),
  course_name text not null,
  name        text not null check (char_length(name) between 1 and 60),
  kind        text not null check (kind in ('fnb', 'shop', 'charity')),
  price_cents int  not null check (price_cents between 0 and 100000),
  active      boolean not null default true
);

create table public.events (
  id                   uuid primary key default gen_random_uuid(),
  course_name          text not null,
  name                 text not null check (char_length(name) between 3 and 80),
  starts_at            timestamptz not null,
  foursome_price_cents int not null check (foursome_price_cents between 0 and 1000000),
  max_teams            smallint not null default 36
);

-- A verified roster: exactly three named players with phone + email (no "guest" slots).
create function public.valid_roster(r jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(r) = 'array' and jsonb_array_length(r) = 3 and not exists (
    select 1 from jsonb_array_elements(r) p
    where coalesce(char_length(p ->> 'first'), 0) not between 1 and 40
       or coalesce(char_length(p ->> 'last'), 0) not between 1 and 40
       or coalesce(p ->> 'phone', '') !~ '^\+\d{8,15}$'
       or coalesce(p ->> 'email', '') !~* '^[^\s@<>]{1,64}@[^\s@<>]{1,255}\.[a-z]{2,}$'
       or concat(p ->> 'first', p ->> 'last') ~ '[<>]'
  );
$$;

create table public.registrations (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  captain_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  team_name   text not null check (char_length(team_name) between 2 and 30 and team_name !~ '[<>]'),
  roster      jsonb not null check (public.valid_roster(roster)),
  paid        boolean not null default false,
  payment_ref text,
  created_at  timestamptz not null default now()
);

create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  course_name text not null,
  player_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('order', 'hail')),
  hole        smallint not null check (hole between 1 and 18),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  items       jsonb not null default '[]',
  total_cents int not null default 0,
  status      text not null default 'new' check (status in ('new', 'enroute', 'delivered')),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────── server-side pricing & limits
create function public.price_order() returns trigger
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
  -- Nothing to deliver for an all-charity order.
  new.status := case when mulls > 0 and mulls = (select sum((e ->> 'qty')::int) from jsonb_array_elements(new.items) e) then 'delivered' else 'new' end;
  return new;
end;
$$;
create trigger orders_price before insert on public.orders for each row execute function public.price_order();

-- ─────────────────────────────────────────────── RLS
alter table public.staff_members   enable row level security;
alter table public.course_settings enable row level security;
alter table public.menu_items      enable row level security;
alter table public.events          enable row level security;
alter table public.registrations   enable row level security;
alter table public.orders          enable row level security;
revoke all on public.staff_members, public.course_settings, public.menu_items, public.events, public.registrations, public.orders from anon, authenticated;

-- staff_members: you can see your own staff rows (to unlock the Clubhouse OS); nobody writes via the API.
grant select on public.staff_members to authenticated;
create policy staff_self on public.staff_members for select to authenticated using (user_id = auth.uid());

-- settings: everyone signed in reads; only that course's staff update.
grant select, update (live_ordering, hail_cart, mulligan_limit) on public.course_settings to authenticated;
create policy settings_read on public.course_settings for select to authenticated using (true);
create policy settings_staff on public.course_settings for update to authenticated
  using (public.is_staff(course_name)) with check (public.is_staff(course_name));

grant select on public.menu_items, public.events to authenticated;
create policy menu_read on public.menu_items for select to authenticated using (active);
create policy events_read on public.events for select to authenticated using (true);

-- registrations: captain creates (unpaid); captain + course staff read. Payment is confirmed by the
-- payment webhook (service role), never by the client.
grant select, insert (event_id, team_name, roster) on public.registrations to authenticated;
create policy reg_insert on public.registrations for insert to authenticated with check (captain_id = auth.uid() and not paid);
create policy reg_read on public.registrations for select to authenticated using (
  captain_id = auth.uid() or public.is_staff((select course_name from public.events e where e.id = event_id))
);

-- orders: players create their own and read their own; staff read the course queue and move status.
grant select, insert (course_name, kind, hole, lat, lng, items), update (status) on public.orders to authenticated;
create policy orders_insert on public.orders for insert to authenticated with check (player_id = auth.uid());
create policy orders_read on public.orders for select to authenticated using (player_id = auth.uid() or public.is_staff(course_name));
create policy orders_staff_update on public.orders for update to authenticated
  using (public.is_staff(course_name)) with check (public.is_staff(course_name));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.course_settings;
  end if;
end $$;

-- Demo seed for the bundled course.
insert into public.course_settings (course_name) values ('Somerby Golf Club');
insert into public.menu_items (sku, course_name, name, kind, price_cents) values
  ('BEER_DRAFT', 'Somerby Golf Club', 'Draft Beer', 'fnb', 700),
  ('WATER', 'Somerby Golf Club', 'Water', 'fnb', 300),
  ('HOTDOG', 'Somerby Golf Club', 'Clubhouse Dog', 'fnb', 800),
  ('BALLS_PROV1', 'Somerby Golf Club', 'Pro V1 (sleeve)', 'shop', 1800),
  ('TEES', 'Somerby Golf Club', 'Tees (pack)', 'shop', 500),
  ('MULLIGAN', 'Somerby Golf Club', 'Charity Mulligan', 'charity', 1000);
