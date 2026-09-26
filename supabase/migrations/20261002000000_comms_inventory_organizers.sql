-- Clubhouse comms, inventory, beverage carts, SOS, organizers and course verification.
--
--  1. Store & inventory: staff CRUD on menu_items (category, stock, visibility); stock is
--     decremented by the pricing trigger and restored on cancel; hidden / sold-out items are
--     refused. Charity items sell only during a live IN-HOUSE tournament.
--  2. Phone-in orders (staff only) and beverage carts; every order is assigned to the nearest
--     active cart on insert.
--  3. Two-way messages (golfer ↔ clubhouse / cart), broadcasts (staff: any audience; organizers:
--     their own event only), SOS alerts.
--  4. Venues directory, organizers, organizer-owned events; course verification with platform
--     admin approval (approval grants staff access to that course).
--  5. Event favorites and in-app event shares between friends.

-- ─────────────────────────────────────────────── helpers
create table public.platform_admins (user_id uuid primary key references public.profiles (id) on delete cascade);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Is the signed-in user on a team for this event (captain or roster phone)?
create function public.in_event(ev uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.registrations r
    where r.event_id = ev and (
      r.captain_id = auth.uid() or exists (
        select 1 from jsonb_array_elements(r.roster) p, auth.users u
        where u.id = auth.uid() and u.phone is not null
          and regexp_replace(p ->> 'phone', '\D', '', 'g') = regexp_replace(u.phone, '\D', '', 'g')
      )
    )
  );
$$;

-- ─────────────────────────────────────────────── 1. store & inventory
alter table public.course_settings add column in_house boolean not null default false;
grant update (in_house) on public.course_settings to authenticated;

alter table public.menu_items
  add column category text,
  add column stock    int check (stock between 0 and 9999), -- null = untracked
  add column visible  boolean not null default true;
update public.menu_items set category = case kind when 'fnb' then (case when sku in ('HOTDOG') then 'food' else 'beverage' end) when 'shop' then 'proshop' else 'charity' end;
alter table public.menu_items
  alter column category set not null,
  add constraint menu_items_category_check check (category in ('food', 'beverage', 'proshop', 'apparel', 'charity')),
  add constraint menu_items_kind_matches check (
    (category in ('food', 'beverage') and kind = 'fnb') or (category in ('proshop', 'apparel') and kind = 'shop') or (category = 'charity' and kind = 'charity')),
  add constraint menu_items_name_plain check (name !~ '[<>]');

drop policy menu_read on public.menu_items;
create policy menu_read on public.menu_items for select to authenticated using ((active and visible) or public.is_staff(course_name));
grant insert (sku, course_name, name, kind, category, price_cents, stock, visible, active),
      update (name, kind, category, price_cents, stock, visible, active), delete on public.menu_items to authenticated;
create policy menu_staff_insert on public.menu_items for insert to authenticated with check (public.is_staff(course_name));
create policy menu_staff_update on public.menu_items for update to authenticated using (public.is_staff(course_name)) with check (public.is_staff(course_name));
create policy menu_staff_delete on public.menu_items for delete to authenticated using (public.is_staff(course_name));

-- ─────────────────────────────────────────────── 2. beverage carts + order fields
create table public.bev_carts (
  id           uuid primary key default gen_random_uuid(),
  course_name  text not null,
  name         text not null check (char_length(name) between 1 and 40 and name !~ '[<>]'),
  current_hole smallint not null default 1 check (current_hole between 1 and 18),
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);
alter table public.bev_carts enable row level security;
revoke all on public.bev_carts from anon, authenticated;
grant select, insert (course_name, name, current_hole, active), update (name, current_hole, active, updated_at), delete on public.bev_carts to authenticated;
create policy carts_staff on public.bev_carts for all to authenticated using (public.is_staff(course_name)) with check (public.is_staff(course_name));

alter table public.orders
  add column source         text not null default 'app' check (source in ('app', 'phone')),
  add column note           text check (char_length(note) <= 200 and note !~ '[<>]'),
  add column customer_name  text check (char_length(customer_name) between 2 and 60 and customer_name !~ '[<>]'),
  add column customer_phone text check (customer_phone ~ '^\+\d{8,15}$'),
  add column cart_id        uuid references public.bev_carts (id) on delete set null;
grant insert (source, note, customer_name, customer_phone) on public.orders to authenticated;
grant update (cart_id) on public.orders to authenticated; -- orders_staff_update policy limits this to staff

-- Nearest active cart by holes around the 18-hole loop; ties go to the cart with fewer open orders.
create function public.nearest_cart(course text, h smallint) returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.bev_carts c
   where c.course_name = course and c.active
   order by least(abs(c.current_hole - h), 18 - abs(c.current_hole - h)),
            (select count(*) from public.orders o where o.cart_id = c.id and o.status in ('new', 'enroute')),
            c.id
   limit 1;
$$;

create or replace function public.price_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; m public.menu_items; q int; total int := 0; mulls int := 0; lim int; bought int; n int := 0;
  s public.course_settings;
begin
  select * into s from public.course_settings where course_name = new.course_name;
  -- Phone-in orders are entered by course staff only.
  if new.source = 'phone' then
    if not public.is_staff(new.course_name) then raise exception 'staff_only'; end if;
    if new.customer_name is null or new.customer_phone is null then raise exception 'phone_order_contact'; end if;
  else
    new.customer_name := null; new.customer_phone := null;
  end if;
  new.cart_id := public.nearest_cart(new.course_name, new.hole);
  if new.kind = 'hail' then
    if s.course_name is not null and not s.hail_cart then raise exception 'hail_cart_off'; end if;
    new.items := '[]'; new.total_cents := 0; new.status := 'new'; new.completed_at := null;
    return new;
  end if;
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) > 20 then raise exception 'invalid_items'; end if;
  -- A phone order may be a free-text request ("two waters, no ice") with no catalog items.
  if jsonb_array_length(new.items) = 0 and not (new.source = 'phone' and char_length(coalesce(new.note, '')) >= 3) then raise exception 'invalid_items'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    q := (it ->> 'qty')::int;
    if q is null or q not between 1 and 10 then raise exception 'invalid_qty'; end if;
    select * into m from public.menu_items where sku = it ->> 'sku' and course_name = new.course_name and active and visible for update;
    if not found then raise exception 'unknown_item'; end if;
    if m.stock is not null and m.stock < q then raise exception 'sold_out'; end if;
    total := total + m.price_cents * q; n := n + q;
    if m.kind = 'charity' then
      -- Charity mulligans: in-house tournaments only, while the event is live.
      if s.course_name is null or not (s.in_house and s.tournament_live) then raise exception 'charity_closed'; end if;
      mulls := mulls + q;
    elsif s.course_name is not null and not s.live_ordering and new.source <> 'phone' then raise exception 'ordering_off';
    elsif m.kind = 'fnb' and s.course_name is not null and not public.is_open(s.kitchen_open, s.kitchen_close, s.timezone) then
      raise exception 'kitchen_closed';
    end if;
    if m.stock is not null then update public.menu_items set stock = stock - q where sku = m.sku; end if;
  end loop;
  if mulls > 0 then
    lim := coalesce(s.mulligan_limit, 4);
    select coalesce(sum((e ->> 'qty')::int), 0) into bought
      from public.orders o, jsonb_array_elements(o.items) e
      join public.menu_items mi on mi.sku = e ->> 'sku' and mi.kind = 'charity'
     where o.player_id = new.player_id and o.course_name = new.course_name and o.status <> 'cancelled' and o.created_at > now() - interval '18 hours';
    if bought + mulls > lim then raise exception 'mulligan_limit'; end if;
  end if;
  new.total_cents := total;
  new.status := case when mulls > 0 and mulls = n then 'completed' else 'new' end;
  new.completed_at := case when new.status = 'completed' then now() end;
  if new.status = 'completed' then new.cart_id := null; end if;
  return new;
end;
$$;

-- Cancelled orders put their stock back.
create function public.restock_on_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for it in select * from jsonb_array_elements(old.items) loop
      update public.menu_items set stock = stock + (it ->> 'qty')::int where sku = it ->> 'sku' and stock is not null;
    end loop;
  end if;
  return new;
end;
$$;
create trigger orders_restock after update of status on public.orders for each row execute function public.restock_on_cancel();

-- ─────────────────────────────────────────────── 3. messages, broadcasts, SOS
create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  course_name  text not null,
  thread_player uuid references public.profiles (id) on delete cascade,  -- app golfer
  thread_phone text check (thread_phone ~ '^\+\d{8,15}$'),               -- phone-in golfer
  sender_id    uuid not null default auth.uid(),
  sender_role  text not null check (sender_role in ('player', 'staff', 'cart')),
  body         text not null check (char_length(body) between 1 and 1000 and body !~ '[<>]'),
  read_by_staff  boolean not null default false,
  read_by_player boolean not null default false,
  created_at   timestamptz not null default now(),
  check (thread_player is not null or thread_phone is not null)
);
create index messages_thread on public.messages (course_name, thread_player, created_at);
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select, insert (course_name, thread_player, thread_phone, sender_role, body), update (read_by_staff, read_by_player) on public.messages to authenticated;
create policy msg_player_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and sender_role = 'player' and thread_player = auth.uid() and thread_phone is null
              and exists (select 1 from public.course_settings c where c.course_name = messages.course_name));
create policy msg_staff_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and sender_role in ('staff', 'cart') and public.is_staff(course_name));
create policy msg_read on public.messages for select to authenticated using (thread_player = auth.uid() or public.is_staff(course_name));
create policy msg_player_read_flag on public.messages for update to authenticated using (thread_player = auth.uid()) with check (thread_player = auth.uid());
create policy msg_staff_read_flag on public.messages for update to authenticated using (public.is_staff(course_name)) with check (public.is_staff(course_name));

-- Flags only: body / sender can't be edited, and each side only marks its own read flag.
create function public.guard_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
      raise exception 'message_rate_limited';
    end if;
    new.read_by_staff := new.sender_role <> 'player'; new.read_by_player := new.sender_role = 'player';
    return new;
  end if;
  if new.read_by_player is distinct from old.read_by_player and old.thread_player is distinct from auth.uid() then raise exception 'not_your_flag'; end if;
  if new.read_by_staff is distinct from old.read_by_staff and not public.is_staff(old.course_name) then raise exception 'not_your_flag'; end if;
  return new;
end;
$$;
create trigger messages_guard before insert or update on public.messages for each row execute function public.guard_message();

-- Organizers (verified accounts that run tournaments at one or more venues).
create table public.organizers (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 60 and name !~ '[<>]'),
  organization text check (char_length(organization) <= 60 and organization !~ '[<>]'),
  verified     boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.organizers enable row level security;
revoke all on public.organizers from anon, authenticated;
grant select on public.organizers to authenticated;
create policy organizer_self on public.organizers for select to authenticated using (user_id = auth.uid() or public.is_admin());

create function public.is_organizer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizers where user_id = auth.uid() and verified);
$$;

create table public.venues (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null unique,
  location    text not null,
  lat         double precision not null,
  lng         double precision not null,
  on_platform boolean not null default false
);
alter table public.venues enable row level security;
revoke all on public.venues from anon, authenticated;
grant select on public.venues to anon, authenticated;
create policy venues_read on public.venues for select to anon, authenticated using (true);

alter table public.events
  add column venue_id     text references public.venues (id),
  add column organizer_id uuid references public.profiles (id) on delete set null,
  add column status       text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled'));
create function public.is_event_organizer(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_organizer() and exists (select 1 from public.events where id = ev and organizer_id = auth.uid());
$$;

-- Organizers create events only at directory venues, as themselves; course_name follows the venue.
create function public.stamp_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.venue_id is not null then
    select name into new.course_name from public.venues where id = new.venue_id;
    if new.course_name is null then raise exception 'unknown_venue'; end if;
  end if;
  if tg_op = 'INSERT' and not public.is_staff(new.course_name) then new.organizer_id := auth.uid(); end if;
  -- Ownership changes only via admin or service role (no JWT), never by a signed-in organizer.
  if tg_op = 'UPDATE' and new.organizer_id is distinct from old.organizer_id and auth.uid() is not null and not public.is_admin() then raise exception 'owner_locked'; end if;
  return new;
end;
$$;
create trigger events_stamp before insert or update on public.events for each row execute function public.stamp_event();
grant insert (course_name, name, starts_at, foursome_price_cents, max_teams, description, start_time, location, venue_id, status) on public.events to authenticated;
grant update (starts_at, foursome_price_cents, max_teams, venue_id, status) on public.events to authenticated;
grant delete on public.events to authenticated;
create policy events_organizer_insert on public.events for insert to authenticated
  with check (public.is_organizer() and venue_id is not null);
create policy events_organizer_update on public.events for update to authenticated
  using (organizer_id = auth.uid() and public.is_organizer()) with check (organizer_id = auth.uid());
create policy events_organizer_delete on public.events for delete to authenticated
  using (organizer_id = auth.uid() and public.is_organizer() and not exists (select 1 from public.registrations r where r.event_id = events.id));
-- Organizers see and check in their own event's teams.
create policy reg_organizer_read on public.registrations for select to authenticated using (public.is_event_organizer(event_id));
create policy reg_organizer_checkin on public.registrations for update to authenticated using (public.is_event_organizer(event_id)) with check (public.is_event_organizer(event_id));
create or replace function public.guard_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.checked_in_at is distinct from old.checked_in_at
     and not (public.is_staff(public.event_course(new.event_id)) or public.is_event_organizer(new.event_id)) then
    raise exception 'staff_only';
  end if;
  return new;
end;
$$;

create table public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  course_name text not null,
  event_id    uuid references public.events (id) on delete cascade,
  kind        text not null check (kind in ('lightning', 'weather', 'frost', 'closure', 'cancellation', 'general')),
  severity    text not null check (severity in ('info', 'warning', 'critical')),
  title       text not null check (char_length(title) between 1 and 120 and title !~ '[<>]'),
  body        text not null check (char_length(body) between 1 and 600 and body !~ '[<>]'),
  audience    text not null check (audience in ('on-course', 'event', 'all')),
  author_id   uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (audience <> 'event' or event_id is not null)
);
alter table public.broadcasts enable row level security;
revoke all on public.broadcasts from anon, authenticated;
grant select, insert (course_name, event_id, kind, severity, title, body, audience) on public.broadcasts to authenticated;
create policy bc_staff_insert on public.broadcasts for insert to authenticated with check (author_id = auth.uid() and public.is_staff(course_name));
create policy bc_organizer_insert on public.broadcasts for insert to authenticated
  with check (author_id = auth.uid() and audience = 'event' and public.is_event_organizer(event_id) and course_name = public.event_course(event_id));
create policy bc_read on public.broadcasts for select to authenticated using (
  audience in ('all', 'on-course') or public.in_event(event_id) or public.is_staff(course_name) or public.is_event_organizer(event_id));
create function public.limit_broadcasts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.broadcasts where author_id = new.author_id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'broadcast_rate_limited';
  end if;
  return new;
end;
$$;
create trigger broadcasts_limit before insert on public.broadcasts for each row execute function public.limit_broadcasts();

create table public.sos_alerts (
  id          uuid primary key default gen_random_uuid(),
  course_name text not null,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  from_role   text not null check (from_role in ('player', 'cart')),
  name        text not null check (char_length(name) between 1 and 60 and name !~ '[<>]'),
  phone       text check (phone ~ '^\+\d{8,15}$'),
  hole        smallint check (hole between 1 and 18),
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  note        text check (char_length(note) <= 200 and note !~ '[<>]'),
  status      text not null default 'active' check (status in ('active', 'acknowledged', 'resolved', 'cancelled')),
  ack_by      uuid,
  ack_at      timestamptz,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index sos_one_open on public.sos_alerts (reporter_id) where status in ('active', 'acknowledged');
alter table public.sos_alerts enable row level security;
revoke all on public.sos_alerts from anon, authenticated;
grant select, insert (course_name, from_role, name, phone, hole, lat, lng, note), update (status) on public.sos_alerts to authenticated;
create policy sos_insert on public.sos_alerts for insert to authenticated with check (
  reporter_id = auth.uid() and status = 'active'
  and exists (select 1 from public.course_settings c where c.course_name = sos_alerts.course_name)
  and (from_role = 'player' or public.is_staff(course_name)));
create policy sos_read on public.sos_alerts for select to authenticated using (reporter_id = auth.uid() or public.is_staff(course_name));
create policy sos_reporter_cancel on public.sos_alerts for update to authenticated
  using (reporter_id = auth.uid() and status = 'active') with check (reporter_id = auth.uid() and status = 'cancelled');
create policy sos_staff_update on public.sos_alerts for update to authenticated
  using (public.is_staff(course_name)) with check (public.is_staff(course_name) and status in ('acknowledged', 'resolved'));
create function public.stamp_sos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'acknowledged' and old.status <> 'acknowledged' then new.ack_by := auth.uid(); new.ack_at := now(); end if;
  if new.status in ('resolved', 'cancelled') and old.status not in ('resolved', 'cancelled') then new.resolved_at := now(); end if;
  if old.status in ('resolved', 'cancelled') then raise exception 'sos_closed'; end if;
  return new;
end;
$$;
create trigger sos_stamp before update on public.sos_alerts for each row execute function public.stamp_sos();

-- ─────────────────────────────────────────────── 4. course verification
create table public.course_verification_requests (
  id           uuid primary key default gen_random_uuid(),
  venue_id     text not null references public.venues (id),
  applicant_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  applicant    text not null check (char_length(applicant) between 3 and 60 and applicant !~ '[<>]'),
  title        text not null check (char_length(title) between 2 and 60 and title !~ '[<>]'),
  email        text not null check (email ~* '^[^\s@<>]{1,64}@[^\s@<>]{1,255}\.[a-z]{2,}$'),
  phone        text not null check (phone ~ '^\+\d{8,15}$'),
  -- Private storage bucket "course-verification" (applicant write-once, admin read).
  proof_path   text not null check (proof_path ~ '^[a-z0-9/_.-]{1,200}\.(png|jpe?g|webp|pdf)$'),
  note         text check (char_length(note) <= 300 and note !~ '[<>]'),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason       text check (char_length(reason) <= 200),
  decided_by   uuid,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index cvr_one_pending on public.course_verification_requests (venue_id, applicant_id) where status = 'pending';
alter table public.course_verification_requests enable row level security;
revoke all on public.course_verification_requests from anon, authenticated;
grant select, insert (venue_id, applicant, title, email, phone, proof_path, note), update (status, reason) on public.course_verification_requests to authenticated;
create policy cvr_insert on public.course_verification_requests for insert to authenticated with check (applicant_id = auth.uid() and status = 'pending');
create policy cvr_read on public.course_verification_requests for select to authenticated using (applicant_id = auth.uid() or public.is_admin());
create policy cvr_admin on public.course_verification_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Approval is what grants Clubhouse OS access: the applicant becomes staff of that course.
create function public.decide_verification() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.venues;
begin
  if old.status <> 'pending' then raise exception 'already_decided'; end if;
  new.decided_by := auth.uid(); new.decided_at := now();
  if new.status = 'approved' then
    select * into v from public.venues where id = new.venue_id;
    insert into public.staff_members (user_id, course_name, role) values (new.applicant_id, v.name, 'staff') on conflict do nothing;
    insert into public.course_settings (course_name) values (v.name) on conflict do nothing;
    update public.venues set on_platform = true where id = v.id;
  end if;
  return new;
end;
$$;
create trigger cvr_decide before update of status on public.course_verification_requests for each row execute function public.decide_verification();

-- ─────────────────────────────────────────────── 5. favorites + shares
create table public.event_favorites (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table public.event_favorites enable row level security;
revoke all on public.event_favorites from anon, authenticated;
grant select, insert (event_id), delete on public.event_favorites to authenticated;
create policy fav_own on public.event_favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.event_shares (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  from_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  seen       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, from_id, to_id)
);
alter table public.event_shares enable row level security;
revoke all on public.event_shares from anon, authenticated;
grant select, insert (event_id, to_id), update (seen) on public.event_shares to authenticated;
-- Only to accepted friends (no spamming strangers).
create policy share_insert on public.event_shares for insert to authenticated with check (
  from_id = auth.uid() and exists (
    select 1 from public.friendships f where f.status = 'accepted'
      and ((f.user_id = auth.uid() and f.friend_id = to_id) or (f.friend_id = auth.uid() and f.user_id = to_id))));
create policy share_read on public.event_shares for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());
create policy share_seen on public.event_shares for update to authenticated using (to_id = auth.uid()) with check (to_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.broadcasts, public.sos_alerts, public.menu_items, public.bev_carts;
  end if;
end $$;

-- ─────────────────────────────────────────────── seed
insert into public.venues (id, name, location, lat, lng, on_platform) values
  ('somerby', 'Somerby Golf Club', 'Byron, MN', 44.0474, -92.6319, true),
  ('rochester-gcc', 'Rochester Golf & Country Club', 'Rochester, MN', 44.03, -92.51, false),
  ('eastwood', 'Eastwood Golf Course', 'Rochester, MN', 43.99, -92.42, false),
  ('northern-hills', 'Northern Hills Golf Course', 'Rochester, MN', 44.07, -92.49, false),
  ('soldiers-field', 'Soldiers Field Golf Course', 'Rochester, MN', 44.0, -92.47, false),
  ('willow-creek', 'Willow Creek Golf Course', 'Rochester, MN', 43.97, -92.5, false);
update public.events set venue_id = 'somerby' where course_name = 'Somerby Golf Club';
insert into public.bev_carts (course_name, name, current_hole) values
  ('Somerby Golf Club', 'Cart 1 · Front nine', 3), ('Somerby Golf Club', 'Cart 2 · Back nine', 12);
update public.menu_items set category = 'beverage' where sku in ('BEER_DRAFT', 'WATER');
insert into public.menu_items (sku, course_name, name, kind, category, price_cents, stock) values
  ('SELTZER', 'Somerby Golf Club', 'Hard Seltzer', 'fnb', 'beverage', 700, 48),
  ('SPORTS_DRINK', 'Somerby Golf Club', 'Sports Drink', 'fnb', 'beverage', 400, 36),
  ('TURKEY_WRAP', 'Somerby Golf Club', 'Turkey Wrap', 'fnb', 'food', 1100, 12),
  ('GLOVE', 'Somerby Golf Club', 'Golf Glove', 'shop', 'proshop', 2200, 15),
  ('CAP', 'Somerby Golf Club', 'Somerby Cap', 'shop', 'apparel', 2800, 20);
update public.menu_items set stock = 40 where sku = 'BALLS_PROV1';
update public.menu_items set stock = 60 where sku = 'TEES';
