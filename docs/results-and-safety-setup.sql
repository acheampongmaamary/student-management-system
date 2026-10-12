-- Run this in the Supabase SQL Editor AFTER role-access-setup.sql. It is safe to re-run.
-- Adds:
--   1. Academic results and KNUST CWA (courses, academic_results)
--   2. Campus Guardian SOS: panic alerts and SafeWalk check-in timers (emergency_alerts)
--   3. A 'security' role for the campus security dispatch desk
--
-- Access rules:
--   results  - admin/registry manage all; students read only their own.
--   alerts   - students raise and see only their own; security and admin see and handle all.
--              Alerts are only written through the functions below, never directly.
--   security - sees alerts and the name/phone of students who raised one. No academic data.

-- ---------------------------------------------------------------------------
-- Roles and helpers
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'registry', 'admin', 'security'));

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.current_student_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select student_id::text from public.students where auth_user_id = (select auth.uid());
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.students'::regclass
      and c.contype in ('p', 'u')
      and array_length(c.conkey, 1) = 1
      and a.attname = 'student_id'
  ) then
    alter table public.students add constraint students_student_id_key unique (student_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Academic results and CWA
-- ---------------------------------------------------------------------------

create table if not exists public.courses (
  course_code text primary key check (char_length(course_code) between 3 and 15),
  course_title text not null check (char_length(course_title) between 2 and 200),
  credit_hours integer not null check (credit_hours between 1 and 6),
  created_at timestamptz not null default now()
);

create table if not exists public.academic_results (
  id bigint generated always as identity primary key,
  student_id text not null references public.students (student_id) on update cascade on delete cascade,
  course_code text not null references public.courses (course_code) on update cascade,
  academic_year text not null check (academic_year ~ '^\d{4}/\d{4}$'),
  semester smallint not null check (semester in (1, 2)),
  mark numeric(5, 2) not null check (mark between 0 and 100),
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, course_code, academic_year, semester)
);

create index if not exists academic_results_student_idx on public.academic_results (student_id);

alter table public.courses enable row level security;
alter table public.academic_results enable row level security;

drop policy if exists "signed-in users read courses" on public.courses;
create policy "signed-in users read courses"
  on public.courses for select to authenticated
  using (true);

drop policy if exists "staff manage courses" on public.courses;
create policy "staff manage courses"
  on public.courses for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "students read own results, staff read all" on public.academic_results;
create policy "students read own results, staff read all"
  on public.academic_results for select to authenticated
  using (student_id = (select public.current_student_id()) or (select public.is_staff()));

drop policy if exists "staff insert results" on public.academic_results;
create policy "staff insert results"
  on public.academic_results for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "staff update results" on public.academic_results;
create policy "staff update results"
  on public.academic_results for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "staff delete results" on public.academic_results;
create policy "staff delete results"
  on public.academic_results for delete to authenticated
  using ((select public.is_staff()));

revoke all on public.courses, public.academic_results from anon;
grant select, insert, update, delete on public.courses, public.academic_results to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Campus Guardian SOS
-- ---------------------------------------------------------------------------
-- status flow:
--   panic:    active -> acknowledged -> resolved
--   safewalk: monitoring -> completed (student checked in)
--             monitoring past safewalk_due_at is shown to security as OVERDUE, even if the
--             student's phone is off -> acknowledged -> resolved

create table if not exists public.emergency_alerts (
  id bigint generated always as identity primary key,
  student_id text not null references public.students (student_id) on update cascade on delete cascade,
  raised_by uuid not null references auth.users (id) on delete cascade,
  alert_type text not null check (alert_type in ('panic', 'safewalk')),
  status text not null check (status in ('active', 'monitoring', 'completed', 'acknowledged', 'resolved')),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy_m double precision,
  location_updated_at timestamptz,
  note text check (char_length(note) <= 500),
  safewalk_due_at timestamptz,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_note text check (char_length(resolution_note) <= 1000)
);

create index if not exists emergency_alerts_open_idx
  on public.emergency_alerts (status, created_at desc);

alter table public.emergency_alerts enable row level security;

drop policy if exists "students read own alerts, security and admin read all" on public.emergency_alerts;
create policy "students read own alerts, security and admin read all"
  on public.emergency_alerts for select to authenticated
  using (
    raised_by = (select auth.uid())
    or (select public.current_app_role()) in ('security', 'admin')
  );

revoke all on public.emergency_alerts from anon, authenticated;
grant select on public.emergency_alerts to authenticated;

drop policy if exists "security reads students who raised alerts" on public.students;
create policy "security reads students who raised alerts"
  on public.students for select to authenticated
  using (
    (select public.current_app_role()) = 'security'
    and exists (select 1 from public.emergency_alerts a where a.student_id = students.student_id)
  );

create or replace function public.raise_panic(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_student text := public.current_student_id();
  new_id bigint;
begin
  if linked_student is null then
    raise exception 'Your login is not linked to a student record, so an alert cannot be raised. Call campus security directly.';
  end if;

  insert into public.emergency_alerts
    (student_id, raised_by, alert_type, status, latitude, longitude, accuracy_m, location_updated_at, note)
  values
    (linked_student, auth.uid(), 'panic', 'active', p_latitude, p_longitude, p_accuracy_m,
     case when p_latitude is null then null else now() end, nullif(trim(p_note), ''))
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.start_safewalk(
  p_minutes integer,
  p_destination text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_student text := public.current_student_id();
  new_id bigint;
begin
  if linked_student is null then
    raise exception 'Your login is not linked to a student record.';
  end if;
  if p_minutes is null or p_minutes not between 5 and 120 then
    raise exception 'A SafeWalk must last between 5 and 120 minutes.';
  end if;
  if exists (
    select 1 from public.emergency_alerts
    where raised_by = auth.uid() and alert_type = 'safewalk' and status = 'monitoring'
  ) then
    raise exception 'You already have a SafeWalk in progress.';
  end if;

  insert into public.emergency_alerts
    (student_id, raised_by, alert_type, status, latitude, longitude, accuracy_m, location_updated_at,
     note, safewalk_due_at)
  values
    (linked_student, auth.uid(), 'safewalk', 'monitoring', p_latitude, p_longitude, p_accuracy_m,
     case when p_latitude is null then null else now() end, nullif(trim(p_destination), ''),
     now() + make_interval(mins => p_minutes))
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.update_safewalk_location(
  p_alert_id bigint,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.emergency_alerts
  set latitude = p_latitude, longitude = p_longitude, accuracy_m = p_accuracy_m, location_updated_at = now()
  where id = p_alert_id
    and raised_by = auth.uid()
    and alert_type = 'safewalk'
    and status in ('monitoring', 'acknowledged');
end;
$$;

create or replace function public.complete_safewalk(p_alert_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.emergency_alerts
  set status = 'completed', resolved_at = now(), resolved_by = auth.uid()
  where id = p_alert_id
    and raised_by = auth.uid()
    and alert_type = 'safewalk'
    and status = 'monitoring';

  if not found then
    raise exception 'This SafeWalk is no longer active. If security has already been alerted, please call them to confirm you are safe.';
  end if;
end;
$$;

create or replace function public.acknowledge_alert(p_alert_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() not in ('security', 'admin') then
    raise exception 'Only security or admin accounts can acknowledge alerts.';
  end if;

  update public.emergency_alerts
  set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = auth.uid()
  where id = p_alert_id and status in ('active', 'monitoring');

  if not found then
    raise exception 'This alert is no longer open.';
  end if;
end;
$$;

create or replace function public.resolve_alert(p_alert_id bigint, p_resolution_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() not in ('security', 'admin') then
    raise exception 'Only security or admin accounts can resolve alerts.';
  end if;

  update public.emergency_alerts
  set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(),
      resolution_note = nullif(trim(p_resolution_note), '')
  where id = p_alert_id and status in ('active', 'monitoring', 'acknowledged');

  if not found then
    raise exception 'This alert is no longer open.';
  end if;
end;
$$;

revoke execute on function
  public.current_app_role(),
  public.current_student_id(),
  public.raise_panic(double precision, double precision, double precision, text),
  public.start_safewalk(integer, text, double precision, double precision, double precision),
  public.update_safewalk_location(bigint, double precision, double precision, double precision),
  public.complete_safewalk(bigint),
  public.acknowledge_alert(bigint),
  public.resolve_alert(bigint, text)
from public, anon;

grant execute on function
  public.current_app_role(),
  public.current_student_id(),
  public.raise_panic(double precision, double precision, double precision, text),
  public.start_safewalk(integer, text, double precision, double precision, double precision),
  public.update_safewalk_location(bigint, double precision, double precision, double precision),
  public.complete_safewalk(bigint),
  public.acknowledge_alert(bigint),
  public.resolve_alert(bigint, text)
to authenticated;

-- Live updates on the security dispatch screen. Row-level security still applies.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'emergency_alerts'
  ) then
    alter publication supabase_realtime add table public.emergency_alerts;
  end if;
end $$;

-- To make an account the security dispatch desk:
-- update public.profiles set role = 'security'
-- where id = (select id from auth.users where email = 'security@knust.edu.gh');
