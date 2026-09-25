-- Exclusive.Golf core schema with Row-Level Security.
--
-- Principles
--   * Every table has RLS enabled; nothing is readable or writable without a matching policy.
--   * `anon` gets no table access at all. `authenticated` gets only what policies allow.
--   * Scores are never written by clients. `hole_scores` has no INSERT/UPDATE/DELETE grant for
--     `authenticated`; the only writer is `record_hole_score()`, executable by `service_role`
--     (the submit-score edge function) and enforcing golf rules server-side.
--   * Privacy (public / friends / private) is evaluated in SQL via can_view(), so every read
--     path — REST, realtime, views — gets the same answer.

-- ─────────────────────────────────────────────────────────────── types
create type public.visibility as enum ('public', 'friends', 'private');
create type public.round_status as enum ('active', 'completed', 'abandoned');
create type public.friend_status as enum ('pending', 'accepted');

-- ─────────────────────────────────────────────────────────────── profiles
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  handle              text not null unique
                        check (handle ~ '^[a-z0-9._]{3,24}$'),
  display_name        text not null
                        check (char_length(display_name) between 1 and 40
                               and display_name !~ '[<>"`\\]'
                               and display_name !~ '[[:cntrl:]]'),
  handicap            numeric(3, 1) check (handicap between -10 and 54),
  handicap_visibility public.visibility not null default 'friends',
  stats_visibility    public.visibility not null default 'friends',
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────── friendships
create table public.friendships (
  user_id    uuid not null references public.profiles (id) on delete cascade, -- requester
  friend_id  uuid not null references public.profiles (id) on delete cascade, -- addressee
  status     public.friend_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
-- One friendship per unordered pair.
create unique index friendships_pair_uniq
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

-- ─────────────────────────────────────────────────────────────── bags
create table public.bags (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  gear       jsonb not null default '{"brands":[],"models":[],"options":[]}'
               check (jsonb_typeof(gear) = 'object' and octet_length(gear::text) <= 32768),
  carries    jsonb not null default '{}'
               check (jsonb_typeof(carries) = 'object' and octet_length(carries::text) <= 4096),
  notes      text check (char_length(notes) <= 280 and notes !~ '[<>]'),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────── rounds
create table public.rounds (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  course_name  text not null check (char_length(course_name) between 1 and 80 and course_name !~ '[<>]'),
  tee          text not null check (tee in ('black', 'blue', 'white', 'red')),
  format       text not null check (format in ('Stroke Play', 'Match Play', 'Stableford', 'Scramble', 'Best Ball', 'Alt Shot')),
  length       text not null check (length in ('18', 'front', 'back')),
  pars         smallint[] not null
                 check (array_length(pars, 1) = 18 and 3 <= all (pars) and 6 >= all (pars)),
  visibility   public.visibility not null default 'friends',
  status       public.round_status not null default 'active',
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table public.round_players (
  round_id  uuid not null references public.rounds (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table public.hole_scores (
  round_id     uuid not null,
  user_id      uuid not null,
  hole         smallint not null check (hole between 1 and 18),
  strokes      smallint not null check (strokes between 1 and 15),
  putts        smallint not null default 0 check (putts >= 0 and putts <= strokes),
  revisions    smallint not null default 0,
  submitted_at timestamptz not null default now(),
  primary key (round_id, user_id, hole),
  foreign key (round_id, user_id) references public.round_players (round_id, user_id) on delete cascade
);

-- ─────────────────────────────────────────────────────────────── helpers
-- SECURITY DEFINER so policy checks can consult friendships without recursing through its RLS.
create function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((user_id = a and friend_id = b) or (user_id = b and friend_id = a))
  );
$$;

create function public.can_view(owner uuid, vis public.visibility) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    owner = auth.uid()
    or vis = 'public'
    or (vis = 'friends' and public.are_friends(owner, auth.uid()))
  );
$$;

create function public.is_round_player(r uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.round_players where round_id = r and user_id = u);
$$;

create function public.round_owner(r uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from public.rounds where id = r;
$$;

-- Whether the caller may see `player`'s scores in `round`. SECURITY DEFINER because it must read
-- the player's privacy setting, which profiles RLS (self-only) would otherwise hide.
create function public.can_see_stats(player uuid, round uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = player
      and (
        public.can_view(p.id, p.stats_visibility)
        -- playing partners see each other unless the player is fully private
        or (p.stats_visibility <> 'private' and public.is_round_player(round, auth.uid()))
      )
  );
$$;

-- ─────────────────────────────────────────────────────────────── RLS
alter table public.profiles      enable row level security;
alter table public.friendships   enable row level security;
alter table public.bags          enable row level security;
alter table public.rounds        enable row level security;
alter table public.round_players enable row level security;
alter table public.hole_scores   enable row level security;

-- Nothing for anon. Column-scoped grants for authenticated.
revoke all on public.profiles, public.friendships, public.bags, public.rounds,
              public.round_players, public.hole_scores from anon, authenticated;

-- profiles: full row only for yourself; others read through profile_cards (privacy-filtered).
grant select, update (display_name, handle, handicap, handicap_visibility, stats_visibility)
  on public.profiles to authenticated;
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- friendships: both parties can see; only requester creates (pending); only addressee accepts.
grant select, insert (user_id, friend_id), update (status), delete on public.friendships to authenticated;
create policy friendships_party_select on public.friendships for select to authenticated
  using (auth.uid() in (user_id, friend_id));
create policy friendships_request on public.friendships for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy friendships_accept on public.friendships for update to authenticated
  using (friend_id = auth.uid()) with check (friend_id = auth.uid() and status = 'accepted');
create policy friendships_remove on public.friendships for delete to authenticated
  using (auth.uid() in (user_id, friend_id));

-- bags: strictly private to the owner.
grant select, insert, update, delete on public.bags to authenticated;
create policy bags_owner_all on public.bags for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- rounds: owner manages; players and anyone allowed by the round's visibility can read.
grant select, insert (course_name, tee, format, length, pars, visibility, owner_id),
      update (status, visibility), delete on public.rounds to authenticated;
create policy rounds_read on public.rounds for select to authenticated
  using (owner_id = auth.uid() or public.is_round_player(id, auth.uid()) or public.can_view(owner_id, visibility));
create policy rounds_create on public.rounds for insert to authenticated
  with check (owner_id = auth.uid() and status = 'active');
create policy rounds_owner_update on public.rounds for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy rounds_owner_delete on public.rounds for delete to authenticated
  using (owner_id = auth.uid());

-- round_players: owner adds themself or accepted friends; a player may leave; visible to round readers.
grant select, insert (round_id, user_id), delete on public.round_players to authenticated;
create policy round_players_read on public.round_players for select to authenticated
  using (user_id = auth.uid() or public.is_round_player(round_id, auth.uid()) or public.round_owner(round_id) = auth.uid());
create policy round_players_add on public.round_players for insert to authenticated
  with check (
    public.round_owner(round_id) = auth.uid()
    and (user_id = auth.uid() or public.are_friends(auth.uid(), user_id))
  );
create policy round_players_leave on public.round_players for delete to authenticated
  using (user_id = auth.uid() or public.round_owner(round_id) = auth.uid());

-- hole_scores: READ ONLY for clients, filtered by each player's stats privacy.
grant select on public.hole_scores to authenticated;
create policy hole_scores_read on public.hole_scores for select to authenticated
  using (user_id = auth.uid() or public.can_see_stats(user_id, round_id));

-- ─────────────────────────────────────────────────────────────── privacy-filtered reads
-- Public card for any profile: handicap only when handicap_visibility allows it.
create view public.profile_cards with (security_barrier = true) as
  select p.id, p.handle, p.display_name,
         case when public.can_view(p.id, p.handicap_visibility) then p.handicap end as handicap
  from public.profiles p
  where auth.uid() is not null;
revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;

-- Leaderboard computed from the scores the caller may see (RLS applies: security_invoker).
create view public.round_leaderboard with (security_invoker = true) as
  select s.round_id, s.user_id,
         count(*)::int                        as thru,
         sum(s.strokes)::int                  as strokes,
         sum(s.strokes - r.pars[s.hole])::int as to_par
  from public.hole_scores s
  join public.rounds r on r.id = s.round_id
  group by s.round_id, s.user_id;
revoke all on public.round_leaderboard from anon;
grant select on public.round_leaderboard to authenticated;

-- ─────────────────────────────────────────────────────────────── score writes
create function public.round_hole_range(len text, out first_hole int, out last_hole int)
language sql immutable as $$
  select case len when 'back' then 10 else 1 end,
         case len when 'front' then 9 else 18 end;
$$;

/**
 * The only write path for scores. Called by the submit-score edge function (service_role) with
 * the user id taken from a verified JWT — never from the request body.
 * Raises P0001 with a machine-readable message on rule violations.
 */
create function public.record_hole_score(
  p_user uuid, p_round uuid, p_hole int, p_strokes int, p_putts int default 0,
  p_min_seconds_between_holes int default 60
) returns public.hole_scores
language plpgsql security definer set search_path = public as $$
declare
  r        public.rounds;
  rng      record;
  existing public.hole_scores;
  last_new timestamptz;
  max_hole int;
  result   public.hole_scores;
begin
  select * into r from public.rounds where id = p_round for share;
  if not found then raise exception 'round_not_found'; end if;
  if r.status <> 'active' then raise exception 'round_not_active'; end if;
  if not public.is_round_player(p_round, p_user) then raise exception 'not_participant'; end if;

  select * into rng from public.round_hole_range(r.length);
  if p_hole is null or p_hole < rng.first_hole or p_hole > rng.last_hole then raise exception 'hole_out_of_range'; end if;
  if p_strokes is null or p_strokes < 1 or p_strokes > 15 then raise exception 'strokes_out_of_range'; end if;
  if p_putts is null or p_putts < 0 or p_putts > p_strokes then raise exception 'putts_out_of_range'; end if;

  select * into existing from public.hole_scores
   where round_id = p_round and user_id = p_user and hole = p_hole for update;

  if found then
    -- Corrections are allowed while the round is active, but bounded.
    if existing.revisions >= 3 then raise exception 'too_many_edits'; end if;
    update public.hole_scores
       set strokes = p_strokes, putts = p_putts, revisions = revisions + 1, submitted_at = now()
     where round_id = p_round and user_id = p_user and hole = p_hole
    returning * into result;
    return result;
  end if;

  -- New hole: no jumping more than one hole ahead of what has been played.
  select coalesce(max(hole), rng.first_hole - 1), max(submitted_at) filter (where revisions = 0)
    into max_hole, last_new
    from public.hole_scores where round_id = p_round and user_id = p_user;
  if p_hole > max_hole + 2 then raise exception 'hole_out_of_sequence'; end if;

  -- Pace plausibility: a real hole takes minutes, not seconds.
  if last_new is not null and now() - last_new < make_interval(secs => p_min_seconds_between_holes) then
    raise exception 'too_fast';
  end if;

  insert into public.hole_scores (round_id, user_id, hole, strokes, putts)
  values (p_round, p_user, p_hole, p_strokes, p_putts)
  returning * into result;
  return result;
end;
$$;

revoke all on function public.record_hole_score(uuid, uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.record_hole_score(uuid, uuid, int, int, int, int) to service_role;

-- Defense in depth: even a privileged writer cannot touch scores of a closed round.
create function public.guard_closed_round() returns trigger
language plpgsql as $$
begin
  if (select status from public.rounds where id = coalesce(new.round_id, old.round_id)) <> 'active' then
    raise exception 'round_not_active';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger hole_scores_guard before insert or update or delete on public.hole_scores
  for each row execute function public.guard_closed_round();

-- Completing a round stamps completed_at; completed rounds cannot be reopened by clients.
create function public.stamp_round_status() returns trigger
language plpgsql as $$
begin
  if old.status <> 'active' and new.status <> old.status then raise exception 'round_closed'; end if;
  if new.status = 'completed' and old.status = 'active' then new.completed_at := now(); end if;
  return new;
end;
$$;
create trigger rounds_status_guard before update on public.rounds
  for each row execute function public.stamp_round_status();

-- ─────────────────────────────────────────────────────────────── signup hook
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'handle', ''));
begin
  if wanted !~ '^[a-z0-9._]{3,24}$' or exists (select 1 from public.profiles where handle = wanted) then
    wanted := 'golfer_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    wanted,
    coalesce(nullif(regexp_replace(left(new.raw_user_meta_data ->> 'display_name', 40), '[<>"`\\[:cntrl:]]', '', 'g'), ''), 'Golfer')
  );
  insert into public.bags (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
