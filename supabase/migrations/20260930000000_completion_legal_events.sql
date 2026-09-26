-- Fulfillment completion (End of Day tally), organizer event branding, and legal acceptances.

-- ─────────────────────────────────────────────── orders: 'delivered' → 'completed' + completed_at
alter table public.orders drop constraint orders_status_check;
update public.orders set status = 'completed' where status = 'delivered';
alter table public.orders
  add constraint orders_status_check check (status in ('new', 'enroute', 'completed')),
  add column completed_at timestamptz;
update public.orders set completed_at = created_at where status = 'completed' and completed_at is null;

-- Server stamps completion time (staff can only move status; the timestamp is never client-set).
create function public.stamp_completion() returns trigger
language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
-- (Inserts are stamped by price_order(), which decides the initial status.)
create trigger orders_completion before update of status on public.orders
  for each row execute function public.stamp_completion();

-- price_order(): charity-only orders are 'completed' (digital, nothing to deliver).
create or replace function public.price_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; m public.menu_items; q int; total int := 0; mulls int := 0; lim int; bought int;
  s public.course_settings;
begin
  select * into s from public.course_settings where course_name = new.course_name;
  if new.kind = 'hail' then
    if s.course_name is not null and not s.hail_cart then raise exception 'hail_cart_off'; end if;
    new.items := '[]'; new.total_cents := 0; new.status := 'new'; new.completed_at := null;
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
    elsif s.course_name is not null and not s.live_ordering then raise exception 'ordering_off';
    elsif m.kind = 'fnb' and s.course_name is not null and not public.is_open(s.kitchen_open, s.kitchen_close, s.timezone) then
      raise exception 'kitchen_closed';
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
  new.total_cents := total;
  new.status := case when mulls > 0 and mulls = (select sum((e ->> 'qty')::int) from jsonb_array_elements(new.items) e) then 'completed' else 'new' end;
  new.completed_at := case when new.status = 'completed' then now() end;
  return new;
end;
$$;

-- End of Day tally for a course and local date (staff only; SECURITY INVOKER so RLS applies).
create function public.eod_tally(course text, day date)
returns table (sku text, name text, kind text, qty bigint, revenue_cents bigint)
language sql stable as $$
  select mi.sku, mi.name, mi.kind, sum((e ->> 'qty')::int), sum((e ->> 'qty')::int * mi.price_cents)
    from public.orders o
    cross join jsonb_array_elements(o.items) e
    join public.menu_items mi on mi.sku = e ->> 'sku'
    join public.course_settings cs on cs.course_name = o.course_name
   where o.course_name = course and o.status = 'completed'
     and (o.completed_at at time zone cs.timezone)::date = day
     and public.is_staff(course)
   group by mi.sku, mi.name, mi.kind
   order by 5 desc;
$$;
grant execute on function public.eod_tally(text, date) to authenticated;

-- ─────────────────────────────────────────────── events: organizer branding
alter table public.events
  add column description   text check (char_length(description) <= 800 and description !~ '[<>]'),
  add column start_time    text check (char_length(start_time) <= 80),
  add column location      text check (char_length(location) <= 120),
  -- Object-storage key of the banner/flyer (bucket "event-banners": staff write, public read).
  add column banner_path   text check (banner_path ~ '^[a-z0-9/_.-]{1,200}\.(png|jpe?g|webp|pdf)$'),
  add column banner_type   text check (banner_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf'));
grant update (name, description, start_time, location, banner_path, banner_type) on public.events to authenticated;
create policy events_staff_edit on public.events for update to authenticated
  using (public.is_staff(course_name)) with check (public.is_staff(course_name));

-- ─────────────────────────────────────────────── legal acceptances (append-only audit trail)
create table public.legal_acceptances (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  document    text not null check (document in ('tos', 'privacy', 'waiver')),
  version     text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  context     text not null check (context in ('signup', 'checkout', 'settings')),
  event_id    uuid references public.events (id) on delete set null,
  accepted_at timestamptz not null default now()
);
create index legal_acceptances_user on public.legal_acceptances (user_id, document);
alter table public.legal_acceptances enable row level security;
grant select, insert (document, version, context, event_id) on public.legal_acceptances to authenticated;
-- No update/delete grants: acceptances can't be altered after the fact.
create policy legal_insert_own on public.legal_acceptances for insert to authenticated with check (user_id = auth.uid());
create policy legal_read on public.legal_acceptances for select to authenticated using (
  user_id = auth.uid()
  -- Organizers can confirm waivers for their own event's participants.
  or (event_id is not null and public.is_staff(public.event_course(event_id)))
);
