-- Run this in the Supabase SQL Editor for the project used by this app.
-- It is safe to re-run: it upgrades an existing setup to the admin / registry / student roles.
-- Review existing policies on these tables first: permissive policies combine with OR,
-- so remove any older policy that grants wider access than the rules below.
--
-- Roles:
--   admin    - full access to student records, and can change roles and link student logins.
--   registry - full access to student records.
--   student  - can view, update, and delete only their own linked record. They cannot change
--              its student ID, programme, level, or login link.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role text not null default 'student',
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'registry', 'admin', 'security'));

alter table public.students
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  if requested_username is null then
    requested_username := 'student_' || left(new.id::text, 8);
  end if;

  insert into public.profiles (id, username, role, email)
  values (new.id, requested_username, 'student', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'registry')
  );
$$;

create or replace function public.protect_student_owned_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_staff() and (
    new.student_id is distinct from old.student_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.course is distinct from old.course
    or new.level is distinct from old.level
  ) then
    raise exception 'Students cannot change their student ID, programme, level, or login link.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_student_owned_columns on public.students;
create trigger protect_student_owned_columns
  before update on public.students
  for each row execute procedure public.protect_student_owned_columns();

create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = (select auth.uid()) and new.role is distinct from old.role then
    raise exception 'You cannot change your own role.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_role_change on public.profiles;
create trigger prevent_self_role_change
  before update on public.profiles
  for each row execute procedure public.prevent_self_role_change();

alter table public.profiles enable row level security;
alter table public.students enable row level security;

drop policy if exists "profile owner or admin can read profiles" on public.profiles;
create policy "profile owner or admin can read profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "admins can update profiles" on public.profiles;
create policy "admins can update profiles"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "students can read their own row and admins can read all" on public.students;
drop policy if exists "students read own row, staff read all" on public.students;
create policy "students read own row, staff read all"
  on public.students for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "admins can insert student rows" on public.students;
drop policy if exists "staff can insert student rows" on public.students;
create policy "staff can insert student rows"
  on public.students for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "admins can update student rows" on public.students;
drop policy if exists "students update own row, staff update all" on public.students;
create policy "students update own row, staff update all"
  on public.students for update to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.is_staff()))
  with check (auth_user_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "admins can delete student rows" on public.students;
drop policy if exists "students delete own row, staff delete all" on public.students;
create policy "students delete own row, staff delete all"
  on public.students for delete to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- After creating a user's Auth account (Authentication -> Users -> Add user), set their role.
-- Once one admin exists, roles and student links can also be managed from the app.
-- update public.profiles set username = 'adminname', role = 'admin'
-- where id = (select id from auth.users where email = 'admin@knust.edu.gh');
--
-- Link a student login to exactly one existing student row:
-- update public.students
-- set auth_user_id = (select id from auth.users where email = 'ama@st.knust.edu.gh')
-- where student_id = 'STUDENT-ID';
