-- Staff management, per-person PINs and permissions (Clubhouse OS + Tournament OS).
--
--   * staff_members becomes a real directory: one row per person per organization (a course
--     name for the Clubhouse OS, or an organizer's id for the Tournament OS), with a role title,
--     a permission list, active flag and a salted PIN hash. Deactivating a row revokes access
--     immediately: is_staff() / has_perm() only count active rows.
--   * Only people with the 'staff' permission manage staff (via functions below). Only owners
--     may grant owner / 'staff'. The last active owner can't be removed or demoted.
--   * staff_pin_login(): quick-switch on a terminal that is already signed in to that
--     organization; 5 wrong PINs lock the organization's terminals for 5 minutes. Every attempt is
--     audited. Passwords and recovery are Supabase Auth (resetPasswordForEmail / verifyOtp).

alter table public.staff_members drop constraint staff_members_pkey;
alter table public.staff_members
  add column id           uuid not null default gen_random_uuid(),
  add column scope        text not null default 'clubhouse' check (scope in ('clubhouse', 'tournament')),
  add column name         text check (char_length(name) between 1 and 60 and name !~ '[<>]'),
  add column email        text check (email ~* '^[^\s@<>]{1,64}@[^\s@<>]{1,255}\.[a-z]{2,}$'),
  add column title        text not null default 'owner' check (title ~ '^[a-z_]{2,30}$'),
  add column permissions  text[] not null default array['teeSheet','orders','store','pricing','messages','broadcasts','tournament','reports','support','settings','staff'],
  add column active       boolean not null default true,
  add column pin_salt     text,
  add column pin_hash     text,
  add column created_by   uuid,
  add column deactivated_at timestamptz,
  add column last_login_at  timestamptz;
alter table public.staff_members alter column user_id drop not null;
alter table public.staff_members add primary key (id);
alter table public.staff_members add constraint staff_members_user_org unique (user_id, course_name);
create unique index staff_members_email_org on public.staff_members (course_name, lower(email)) where email is not null;

create or replace function public.is_staff(course text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid() and course_name = course and active);
$$;
create function public.has_perm(org text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid() and course_name = org and active and (title = 'owner' or perm = any(permissions)));
$$;
create function public.is_owner(org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid() and course_name = org and active and title = 'owner');
$$;

-- Directory read: everyone in the organization sees names / roles (never PIN hashes).
revoke select on public.staff_members from authenticated;
grant select (id, user_id, course_name, scope, name, email, title, permissions, active, created_at, deactivated_at, last_login_at) on public.staff_members to authenticated;
drop policy staff_self on public.staff_members;
create policy staff_read on public.staff_members for select to authenticated using (user_id = auth.uid() or public.is_staff(course_name));

-- Permission-based tightening of existing staff powers.
drop policy menu_staff_insert on public.menu_items;
drop policy menu_staff_update on public.menu_items;
drop policy menu_staff_delete on public.menu_items;
create policy menu_staff_insert on public.menu_items for insert to authenticated with check (public.has_perm(course_name, 'store'));
create policy menu_staff_update on public.menu_items for update to authenticated using (public.has_perm(course_name, 'store')) with check (public.has_perm(course_name, 'store'));
create policy menu_staff_delete on public.menu_items for delete to authenticated using (public.has_perm(course_name, 'store'));
drop policy pricing_staff on public.tee_pricing;
create policy pricing_staff on public.tee_pricing for update to authenticated using (public.has_perm(course_name, 'pricing')) with check (public.has_perm(course_name, 'pricing'));
drop policy settings_staff on public.course_settings;
create policy settings_staff on public.course_settings for update to authenticated using (public.has_perm(course_name, 'settings')) with check (public.has_perm(course_name, 'settings'));

-- ─────────────────────────────────────────────── PIN hashing (salted, iterated SHA-256)
create function public.staff_pin_digest(salt text, pin text) returns text
language plpgsql immutable as $$
declare h bytea := convert_to(salt || ':' || pin, 'UTF8');
begin
  for i in 1..2000 loop h := sha256(h || convert_to(salt, 'UTF8')); end loop;
  return encode(h, 'hex');
end;
$$;
revoke execute on function public.staff_pin_digest(text, text) from public, anon, authenticated;

create function public.valid_pin(pin text) returns boolean
language sql immutable as $$
  select pin ~ '^\d{4,6}$'
     and pin !~ '^(\d)\1+$'
     and pin not in ('1234', '12345', '123456', '4321', '54321', '654321', '2580', '121212', '123123')
     and position(pin in '0123456789') = 0 and position(pin in '9876543210') = 0;
$$;

create function public.pin_in_use(org text, pin text, except_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_members where course_name = org and active and pin_hash is not null and id is distinct from except_id
                 and pin_hash = public.staff_pin_digest(pin_salt, pin));
$$;

-- ─────────────────────────────────────────────── admin functions
create function public.staff_add(org text, p_name text, p_email text, p_title text, p_perms text[], p_pin text default null) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare nid uuid; salt text; sc text;
begin
  if not public.has_perm(org, 'staff') then raise exception 'not_allowed'; end if;
  if (p_title = 'owner' or 'staff' = any(p_perms)) and not public.is_owner(org) then raise exception 'owner_only'; end if;
  if p_pin is not null then
    if not public.valid_pin(p_pin) then raise exception 'weak_pin'; end if;
    if public.pin_in_use(org, p_pin, null) then raise exception 'pin_in_use'; end if;
    salt := encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex');
  end if;
  select scope into sc from public.staff_members where user_id = auth.uid() and course_name = org;
  insert into public.staff_members (user_id, course_name, role, scope, name, email, title, permissions, pin_salt, pin_hash, created_by)
  values ((select id from auth.users where lower(email) = lower(p_email) limit 1), org, 'staff', sc, p_name, lower(p_email), p_title, p_perms,
          salt, case when p_pin is null then null else public.staff_pin_digest(salt, p_pin) end, auth.uid())
  returning id into nid;
  return nid;
end;
$$;

create function public.staff_guard(target uuid) returns public.staff_members
language plpgsql stable security definer set search_path = public as $$
declare t public.staff_members;
begin
  select * into t from public.staff_members where id = target;
  if not found or not public.has_perm(t.course_name, 'staff') then raise exception 'not_allowed'; end if;
  if t.title = 'owner' and not public.is_owner(t.course_name) then raise exception 'owner_only'; end if;
  return t;
end;
$$;

create function public.last_owner(t public.staff_members) returns boolean
language sql stable security definer set search_path = public as $$
  select t.title = 'owner' and (select count(*) from public.staff_members where course_name = t.course_name and active and title = 'owner') <= 1;
$$;

create function public.staff_update(target uuid, p_title text, p_perms text[]) returns void
language plpgsql security definer set search_path = public as $$
declare t public.staff_members := public.staff_guard(target);
begin
  if (p_title = 'owner' or 'staff' = any(p_perms)) and not public.is_owner(t.course_name) then raise exception 'owner_only'; end if;
  if p_title <> 'owner' and public.last_owner(t) then raise exception 'last_owner'; end if;
  update public.staff_members set title = p_title, permissions = p_perms where id = target;
end;
$$;

create function public.staff_set_active(target uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.staff_members := public.staff_guard(target);
begin
  if not p_active and t.user_id = auth.uid() then raise exception 'not_yourself'; end if;
  if not p_active and public.last_owner(t) then raise exception 'last_owner'; end if;
  update public.staff_members set active = p_active, deactivated_at = case when p_active then null else now() end where id = target;
end;
$$;

create function public.staff_remove(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.staff_members := public.staff_guard(target);
begin
  if t.active then raise exception 'deactivate_first'; end if;
  delete from public.staff_members where id = target;
end;
$$;

create function public.staff_set_pin(target uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.staff_members; salt text;
begin
  select * into t from public.staff_members where id = target;
  if not found then raise exception 'not_allowed'; end if;
  if t.user_id is distinct from auth.uid() then perform public.staff_guard(target); end if; -- own PIN, or a manager
  if not t.active then raise exception 'inactive'; end if;
  if not public.valid_pin(p_pin) then raise exception 'weak_pin'; end if;
  if public.pin_in_use(t.course_name, p_pin, target) then raise exception 'pin_in_use'; end if;
  salt := encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex');
  update public.staff_members set pin_salt = salt, pin_hash = public.staff_pin_digest(salt, p_pin) where id = target;
end;
$$;

-- Invited staff: link the row to their account the first time they sign in with that email.
create function public.claim_staff_invite() returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  update public.staff_members s set user_id = auth.uid()
   where s.user_id is null and s.active and lower(s.email) = (select lower(email) from auth.users where id = auth.uid());
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.my_staff_session(scope text) returns table (id uuid, name text, role text, permissions text[], org text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.title, s.permissions, s.course_name from public.staff_members s
   where s.user_id = auth.uid() and s.active and s.scope = my_staff_session.scope order by s.created_at limit 1;
$$;

-- ─────────────────────────────────────────────── PIN quick-switch + lockout + audit
create table public.staff_pin_attempts (org text primary key, fails int not null default 0, locked_until timestamptz);
create table public.staff_access_audit (
  id bigint generated always as identity primary key, org text not null, terminal_user uuid, staff_id uuid,
  method text not null check (method in ('pin')), ok boolean not null, at timestamptz not null default now()
);
alter table public.staff_pin_attempts enable row level security;
alter table public.staff_access_audit enable row level security;
revoke all on public.staff_pin_attempts, public.staff_access_audit from anon, authenticated;
grant select on public.staff_access_audit to authenticated;
create policy access_audit_read on public.staff_access_audit for select to authenticated using (public.has_perm(org, 'staff'));

create function public.staff_pin_login(pin text, org text default null) returns table (id uuid, name text, role text, permissions text[])
language plpgsql security definer set search_path = public as $$
declare o text := org; a public.staff_pin_attempts; hit public.staff_members;
begin
  if o is null then select s.course_name into o from public.staff_members s where s.user_id = auth.uid() and s.active limit 1; end if;
  -- The terminal itself must be signed in to this organization.
  if o is null or not public.is_staff(o) then raise exception 'terminal_not_signed_in'; end if;
  insert into public.staff_pin_attempts (org) values (o) on conflict do nothing;
  select * into a from public.staff_pin_attempts where staff_pin_attempts.org = o for update;
  if a.locked_until > now() then raise exception 'locked'; end if;
  select * into hit from public.staff_members s
   where s.course_name = o and s.active and s.pin_hash is not null and s.pin_hash = public.staff_pin_digest(s.pin_salt, pin) limit 1;
  if hit.id is null then
    update public.staff_pin_attempts set fails = case when a.fails + 1 >= 5 then 0 else a.fails + 1 end,
                                         locked_until = case when a.fails + 1 >= 5 then now() + interval '5 minutes' end
     where staff_pin_attempts.org = o;
    insert into public.staff_access_audit (org, terminal_user, method, ok) values (o, auth.uid(), 'pin', false);
    return;
  end if;
  update public.staff_pin_attempts set fails = 0, locked_until = null where staff_pin_attempts.org = o;
  update public.staff_members set last_login_at = now() where staff_members.id = hit.id;
  insert into public.staff_access_audit (org, terminal_user, staff_id, method, ok) values (o, auth.uid(), hit.id, 'pin', true);
  return query select hit.id, hit.name, hit.title, hit.permissions;
end;
$$;

-- Verified organizers get their own Tournament OS organization (owner row keyed by their id).
create function public.bootstrap_organizer_org() returns text
language plpgsql security definer set search_path = public, auth as $$
declare o text := auth.uid()::text;
begin
  if not public.is_organizer() then raise exception 'not_allowed'; end if;
  insert into public.staff_members (user_id, course_name, role, scope, name, email, title, permissions)
  select auth.uid(), o, 'organizer', 'tournament', org.name, (select lower(email) from auth.users where id = auth.uid()), 'owner',
         array['events','roster','checkin','broadcasts','weather','staff']
    from public.organizers org where org.user_id = auth.uid()
  on conflict do nothing;
  return o;
end;
$$;

-- Course verification now creates the course's owner row.
create or replace function public.decide_verification() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare v public.venues;
begin
  if old.status <> 'pending' then raise exception 'already_decided'; end if;
  new.decided_by := auth.uid(); new.decided_at := now();
  if new.status = 'approved' then
    select * into v from public.venues where id = new.venue_id;
    insert into public.staff_members (user_id, course_name, role, scope, name, email, title)
    values (new.applicant_id, v.name, 'staff', 'clubhouse', new.applicant, lower(new.email), 'owner') on conflict do nothing;
    insert into public.course_settings (course_name) values (v.name) on conflict do nothing;
    update public.venues set on_platform = true where id = v.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.staff_add(text, text, text, text, text[], text), public.staff_update(uuid, text, text[]), public.staff_set_active(uuid, boolean),
  public.staff_remove(uuid), public.staff_set_pin(uuid, text), public.claim_staff_invite(), public.my_staff_session(text), public.staff_pin_login(text, text),
  public.bootstrap_organizer_org() from public, anon;
grant execute on function public.staff_add(text, text, text, text, text[], text), public.staff_update(uuid, text, text[]), public.staff_set_active(uuid, boolean),
  public.staff_remove(uuid), public.staff_set_pin(uuid, text), public.claim_staff_invite(), public.my_staff_session(text), public.staff_pin_login(text, text),
  public.bootstrap_organizer_org() to authenticated;
