-- Run this in the Supabase SQL Editor for the project used by this app.
-- Existing student rows stay unlinked until you set auth_user_id for each student.
-- Review existing policies on these tables first: permissive policies combine with OR,
-- so remove any older policy that grants wider access than the rules below.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

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

  insert into public.profiles (id, username, role)
  values (new.id, requested_username, 'student')
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

alter table public.profiles enable row level security;
alter table public.students enable row level security;

drop policy if exists "profile owner or admin can read profiles" on public.profiles;
create policy "profile owner or admin can read profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "students can read their own row and admins can read all" on public.students;
create policy "students can read their own row and admins can read all"
  on public.students for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "admins can insert student rows" on public.students;
create policy "admins can insert student rows"
  on public.students for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "admins can update student rows" on public.students;
create policy "admins can update student rows"
  on public.students for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "admins can delete student rows" on public.students;
create policy "admins can delete student rows"
  on public.students for delete to authenticated
  using ((select public.is_admin()));

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant execute on function public.is_admin() to authenticated;

-- After creating a user's Auth account, set a unique username and role:
-- insert into public.profiles (id, username, role)
-- values ('AUTH-USER-UUID', 'adminname', 'admin')
-- on conflict (id) do update set username = excluded.username, role = excluded.role;
--
-- Link a student login to exactly one existing student row:
-- update public.students set auth_user_id = 'AUTH-USER-UUID'
-- where student_id = 'STUDENT-ID';
