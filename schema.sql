-- AASTMT Study Hub schema v2 (matches the new interface). Run the WHOLE file once in Supabase > SQL Editor.
-- WARNING: this drops the old Study Hub tables (test data) and recreates them. Auth accounts are kept.
-- Also turn OFF "Confirm email" in Authentication > Providers > Email.

drop table if exists public.extra_courses, public.extra_entries, public.messages, public.materials, public.profiles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.fill_owner() cascade;
drop function if exists public.is_admin() cascade;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  uid text unique not null check (uid ~ '^[0-9]{9}$'),
  name text not null default '',
  role text not null default 'student' check (role in ('student','admin')),
  prof jsonb,
  created_at timestamptz not null default now()
);

create table public.materials (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  uid text, by_name text,
  k text not null, course text not null, type text not null, title text not null,
  link text, descr text, img text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  uid text, by_name text,
  subject text not null, body text not null, reply text,
  created_at timestamptz not null default now()
);

create table public.extra_courses (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  k text not null, name text not null,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, uid, name)
  values (new.id, new.raw_user_meta_data->>'uid', coalesce(new.raw_user_meta_data->>'name',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Stamp the sender's ID and name server-side so they can't be faked
create function public.fill_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.uid, p.name into new.uid, new.by_name from public.profiles p where p.id = auth.uid();
  return new;
end $$;
create trigger materials_owner before insert on public.materials for each row execute function public.fill_owner();
create trigger messages_owner before insert on public.messages for each row execute function public.fill_owner();

alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.messages enable row level security;
alter table public.extra_courses enable row level security;

create policy "profiles read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "materials read" on public.materials for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy "materials insert" on public.materials for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "materials admin update" on public.materials for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "materials admin delete" on public.materials for delete to authenticated using (public.is_admin());

create policy "messages read" on public.messages for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "messages insert" on public.messages for insert to authenticated with check (user_id = auth.uid());
create policy "messages admin update" on public.messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "messages admin delete" on public.messages for delete to authenticated using (public.is_admin());

-- student-added courses are private; admin-added ones (shared = true) are visible to everyone
create policy "extra read" on public.extra_courses for select to authenticated
  using (shared or user_id = auth.uid() or public.is_admin());
create policy "extra insert" on public.extra_courses for insert to authenticated
  with check (user_id = auth.uid() and (not shared or public.is_admin()));

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (prof) on public.profiles to authenticated;
grant select, insert, update, delete on public.materials to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert on public.extra_courses to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Recreate profile rows for accounts that already exist
insert into public.profiles (id, uid, name)
select id, split_part(email,'@',1), coalesce(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name','')
from auth.users where email like '%@studyhub.local'
on conflict (id) do nothing;

-- Make yourself admin (replace with your 9-digit ID), then log out and in:
-- update public.profiles set role = 'admin' where uid = '241006182';
