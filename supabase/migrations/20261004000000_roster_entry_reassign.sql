-- Manual roster entry & cross-tournament reassignment (organizers and course staff).
--
--   * staff_register(): enter a team for an explicitly chosen tournament (no account needed for
--     walk-up / phone-in golfers — the captain is stored as a verified contact), recording what
--     was paid at the desk.
--   * move_registration(): move a whole team, with its payment, to another tournament.
--   * move_player(): move one roster player to another tournament as their own entry, carrying
--     their share of the team's payment (at most one seat).
--   Callers must manage BOTH events (course staff of that course, or the event's organizer).
--   Every change is written to registration_audit.

alter table public.registrations
  alter column captain_id drop not null,
  add column captain_contact jsonb check (captain_contact is null or public.valid_roster(jsonb_build_array(captain_contact, '{}'::jsonb, '{}'::jsonb))),
  add column source     text not null default 'app' check (source in ('app', 'manual')),
  add column entered_by uuid,
  add constraint registrations_has_captain check (captain_id is not null or captain_contact is not null);

create table public.registration_audit (
  id           bigint generated always as identity primary key,
  registration uuid not null,
  action       text not null check (action in ('manual_entry', 'move_team', 'move_player')),
  from_event   uuid,
  to_event     uuid not null,
  paid_cents   int not null default 0,
  detail       jsonb not null default '{}',
  actor        uuid not null default auth.uid(),
  at           timestamptz not null default now()
);
alter table public.registration_audit enable row level security;
revoke all on public.registration_audit from anon, authenticated;
grant select on public.registration_audit to authenticated;

create function public.can_manage_event(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff(public.event_course(ev)) or public.is_event_organizer(ev);
$$;
create policy audit_read on public.registration_audit for select to authenticated
  using (public.can_manage_event(to_event) or (from_event is not null and public.can_manage_event(from_event)));

-- Every phone already entered in an event (captain account, captain contact, roster).
create function public.event_phones(ev uuid, except_reg uuid default null) returns setof text
language sql stable security definer set search_path = public, auth as $$
  select regexp_replace(p ->> 'phone', '\D', '', 'g') from public.registrations r, jsonb_array_elements(r.roster) p
   where r.event_id = ev and r.id is distinct from except_reg and coalesce(p ->> 'phone', '') <> ''
  union select regexp_replace(r.captain_contact ->> 'phone', '\D', '', 'g') from public.registrations r
   where r.event_id = ev and r.id is distinct from except_reg and r.captain_contact is not null
  union select regexp_replace(u.phone, '\D', '', 'g') from public.registrations r join auth.users u on u.id = r.captain_id
   where r.event_id = ev and r.id is distinct from except_reg and u.phone is not null;
$$;

create function public.team_phones(r public.registrations) returns setof text
language sql stable security definer set search_path = public, auth as $$
  select regexp_replace(p ->> 'phone', '\D', '', 'g') from jsonb_array_elements(r.roster) p where coalesce(p ->> 'phone', '') <> ''
  union select regexp_replace(r.captain_contact ->> 'phone', '\D', '', 'g') where r.captain_contact is not null
  union select regexp_replace(u.phone, '\D', '', 'g') from auth.users u where u.id = r.captain_id and u.phone is not null;
$$;

create function public.open_event(ev uuid) returns public.events
language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = ev;
  if not found or e.status <> 'scheduled' or e.starts_at < now() then raise exception 'event_not_open'; end if;
  if (select count(*) from public.registrations where event_id = ev) >= e.max_teams then raise exception 'event_full'; end if;
  return e;
end;
$$;

create function public.staff_register(ev uuid, team text, captain jsonb, roster jsonb, paid_cents int default 0) returns uuid
language plpgsql security definer set search_path = public as $$
declare e public.events; rid uuid; ph text;
begin
  if not public.can_manage_event(ev) then raise exception 'not_allowed'; end if;
  e := public.open_event(ev);
  if paid_cents not between 0 and e.foursome_price_cents then raise exception 'invalid_payment'; end if;
  for ph in select regexp_replace(p ->> 'phone', '\D', '', 'g') from jsonb_array_elements(roster || jsonb_build_array(captain)) p where coalesce(p ->> 'phone', '') <> '' loop
    if ph in (select public.event_phones(ev)) then raise exception 'already_registered'; end if;
  end loop;
  insert into public.registrations (event_id, captain_id, captain_contact, team_name, roster, total_cents, paid_cents, source, entered_by)
  values (ev, null, captain, team, roster, e.foursome_price_cents, paid_cents, 'manual', auth.uid())
  returning id into rid;
  insert into public.registration_audit (registration, action, to_event, paid_cents) values (rid, 'manual_entry', ev, paid_cents);
  return rid;
end;
$$;

create function public.move_registration(reg uuid, to_ev uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.registrations; e public.events;
begin
  select * into r from public.registrations where id = reg for update;
  if not found then raise exception 'not_found'; end if;
  if r.event_id = to_ev then raise exception 'same_event'; end if;
  if not (public.can_manage_event(r.event_id) and public.can_manage_event(to_ev)) then raise exception 'not_allowed'; end if;
  e := public.open_event(to_ev);
  if exists (select 1 from public.team_phones(r) t where t in (select public.event_phones(to_ev))) then raise exception 'already_registered'; end if;
  update public.registrations set event_id = to_ev, total_cents = e.foursome_price_cents, checked_in_at = null where id = reg;
  insert into public.registration_audit (registration, action, from_event, to_event, paid_cents) values (reg, 'move_team', r.event_id, to_ev, r.paid_cents);
end;
$$;

create function public.move_player(reg uuid, slot int, to_ev uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.registrations; e public.events; f public.events; p jsonb; filled int; share int; seat int; nid uuid;
begin
  select * into r from public.registrations where id = reg for update;
  if not found then raise exception 'not_found'; end if;
  if slot not between 0 and 2 then raise exception 'invalid_slot'; end if;
  if r.event_id = to_ev then raise exception 'same_event'; end if;
  if not (public.can_manage_event(r.event_id) and public.can_manage_event(to_ev)) then raise exception 'not_allowed'; end if;
  p := r.roster -> slot;
  if coalesce(p ->> 'phone', '') = '' then raise exception 'empty_slot'; end if;
  e := public.open_event(to_ev);
  if regexp_replace(p ->> 'phone', '\D', '', 'g') in (select public.event_phones(to_ev)) then raise exception 'already_registered'; end if;
  select * into f from public.events where id = r.event_id;
  filled := 1 + (select count(*) from jsonb_array_elements(r.roster) x where coalesce(x ->> 'phone', '') <> '');
  share := least(r.paid_cents / filled, f.foursome_price_cents / 4);
  seat := e.foursome_price_cents / 4;
  update public.registrations set roster = jsonb_set(roster, array[slot::text], '{"first":"","last":"","phone":"","email":""}'::jsonb), paid_cents = paid_cents - share where id = reg;
  insert into public.registrations (event_id, captain_id, captain_contact, team_name, roster, total_cents, paid_cents, source, entered_by)
  values (to_ev, null, p, left(regexp_replace(p ->> 'last', '[<>]', '', 'g') || ' (moved)', 30),
          '[{"first":"","last":"","phone":"","email":""},{"first":"","last":"","phone":"","email":""},{"first":"","last":"","phone":"","email":""}]'::jsonb,
          seat, least(share, seat), 'manual', auth.uid())
  returning id into nid;
  insert into public.registration_audit (registration, action, from_event, to_event, paid_cents, detail) values (nid, 'move_player', r.event_id, to_ev, least(share, seat), jsonb_build_object('from_registration', reg));
  return nid;
end;
$$;

revoke execute on function public.staff_register(uuid, text, jsonb, jsonb, int), public.move_registration(uuid, uuid), public.move_player(uuid, int, uuid) from public, anon;
grant execute on function public.staff_register(uuid, text, jsonb, jsonb, int), public.move_registration(uuid, uuid), public.move_player(uuid, int, uuid) to authenticated;
