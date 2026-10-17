-- AASTMT Study Hub schema. Run once in Supabase > SQL Editor.
-- Also turn OFF "Confirm email" in Authentication > Providers > Email,
-- because sign-in emails are internal (<university-id>@studyhub.local).

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  uid text unique not null check (uid ~ '^[0-9]{9}$'),
  full_name text not null default '',
  role text not null default 'student' check (role in ('student','admin')),
  branch text, college text, major text, track text, semester text, eng_system text,
  created_at timestamptz not null default now()
);

create table public.materials (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  course text not null, type text not null, title text not null,
  link text, description text, image_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject text not null, body text not null,
  reply text, replied_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.extra_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  key text not null, course text not null,
  created_at timestamptz not null default now()
);

-- Create a profile automatically when someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, uid, full_name)
  values (new.id, new.raw_user_meta_data->>'uid', coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.messages enable row level security;
alter table public.extra_entries enable row level security;

-- profiles: see/edit your own; admins see all. Users can never change their own role.
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, branch, college, major, track, semester, eng_system) on public.profiles to authenticated;

-- materials: everyone signed in sees approved ones; you see your own; admins see and moderate all
create policy "materials read" on public.materials for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy "materials insert" on public.materials for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "materials admin update" on public.materials for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "materials delete" on public.materials for delete to authenticated
  using (public.is_admin() or (user_id = auth.uid() and status <> 'approved'));

-- messages: private between the student and admins
create policy "messages read" on public.messages for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "messages insert" on public.messages for insert to authenticated
  with check (user_id = auth.uid());
create policy "messages admin reply" on public.messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- extra course entries: shared with all signed-in users
create policy "extra read" on public.extra_entries for select to authenticated using (true);
create policy "extra insert" on public.extra_entries for insert to authenticated
  with check (user_id = auth.uid());

-- Make yourself admin after you create your account (replace with your 9-digit ID):
-- update public.profiles set role = 'admin' where uid = '123456789';

-- ---------------------------------------------------------------
-- Table permissions (fixes "permission denied for table profiles").
-- RLS decides WHICH rows; these grants let signed-in users touch the tables at all.
-- ---------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, branch, college, major, track, semester, eng_system) on public.profiles to authenticated;
grant select, insert, update, delete on public.materials to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, insert on public.extra_entries to authenticated;
grant execute on function public.is_admin() to authenticated;

-- If you signed up BEFORE running the schema (no profile row yet), backfill it:
insert into public.profiles (id, uid, full_name)
select id, split_part(email, '@', 1), coalesce(raw_user_meta_data->>'full_name', '')
from auth.users
on conflict (id) do nothing;
