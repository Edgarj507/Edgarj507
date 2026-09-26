-- Everyday clubhouse operations: tee-sheet blocks with a reason. A block covers one slot, a time
-- window, or whole days across a date range (from/to null = all day). Staff only.

create table public.tee_blocks (
  id          uuid primary key default gen_random_uuid(),
  course_name text not null,
  reason      text not null check (reason in ('Maintenance', 'Private Event', 'Tournament', 'Season Closed', 'Irrigation repair', 'Weather', 'League', 'Other')),
  note        text check (char_length(note) <= 80 and note !~ '[<>]'),
  start_date  date not null,
  end_date    date not null,
  from_time   time,
  to_time     time,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date < 366),
  check ((from_time is null) = (to_time is null)),
  check (from_time is null or to_time > from_time)
);
create index tee_blocks_course_dates on public.tee_blocks (course_name, start_date, end_date);

alter table public.tee_blocks enable row level security;
grant select, insert, update, delete on public.tee_blocks to authenticated;
create policy tee_blocks_staff on public.tee_blocks for all to authenticated
  using (public.is_staff(course_name)) with check (public.is_staff(course_name));

-- Reservations can't land inside a block (checked in the course's local time).
create function public.check_tee_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare tz text; d date; t time;
begin
  if new.status <> 'reserved' then return new; end if;
  select coalesce(timezone, 'America/Chicago') into tz from public.course_settings where course_name = new.course_name;
  d := (new.starts_at at time zone coalesce(tz, 'America/Chicago'))::date;
  t := (new.starts_at at time zone coalesce(tz, 'America/Chicago'))::time;
  if exists (
    select 1 from public.tee_blocks b
    where b.course_name = new.course_name and d between b.start_date and b.end_date
      and (b.from_time is null or (t >= b.from_time and t < b.to_time))
  ) then
    raise exception 'tee_time_blocked';
  end if;
  return new;
end;
$$;
create trigger tee_times_block before insert or update on public.tee_times
  for each row execute function public.check_tee_block();
