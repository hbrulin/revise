-- Révise ensemble — setup et migration Supabase.
-- Après exécution, active aussi Auth > Providers > Anonymous sign-ins.
-- Les champs de profil, genre, contact et disponibilités sont publics par choix explicite.

create extension if not exists pgcrypto;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  address text not null check (char_length(address) between 3 and 160),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  capacity integer not null check (capacity between 1 and 100),
  kind text not null default 'Autre',
  days text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 260),
  area text not null default '',
  department text,
  contact text not null default '' check (char_length(contact) <= 100),
  owner_id uuid references auth.users(id) on delete set null,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 40),
  age smallint constraint profiles_age_range_check check (age between 15 and 99),
  gender text not null default 'Non renseigné' constraint profiles_gender_allowed_check check (gender in ('F','M','Non binaire','Non renseigné')),
  study text not null default '' check (char_length(study) <= 80),
  department text,
  area text not null check (char_length(area) between 1 and 60),
  days text[] not null default '{}',
  subjects jsonb not null default '{}'::jsonb,
  groups text[] not null default '{}',
  needs text not null default '' check (char_length(needs) <= 180),
  contact text not null default '' check (char_length(contact) <= 100),
  owner_id uuid references auth.users(id) on delete cascade,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- Add columns for projects that were created with an earlier version of this app.
alter table public.places add column if not exists department text;
alter table public.places add column if not exists contact text not null default '';
alter table public.places add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists age smallint;
alter table public.profiles add column if not exists gender text not null default 'Non renseigné';
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists owner_id uuid references auth.users(id) on delete cascade;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_age_range_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_age_range_check check (age is null or age between 15 and 99);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_gender_allowed_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_gender_allowed_check check (gender in ('F','M','Non binaire','Non renseigné'));
  end if;
end $$;

create table if not exists public.place_attendance (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  meeting_date date not null,
  created_at timestamptz not null default now(),
  unique(place_id, profile_id, meeting_date)
);

alter table public.places enable row level security;
alter table public.profiles enable row level security;
alter table public.place_attendance enable row level security;

-- Remove the old public insert policies, which allowed unowned rows.
drop policy if exists "Anyone can suggest a place" on public.places;
drop policy if exists "Anyone can create a profile" on public.profiles;
drop policy if exists "Anyone can read published places" on public.places;
drop policy if exists "Anyone can read published profiles" on public.profiles;

drop policy if exists "Published places are public" on public.places;
create policy "Published places are public" on public.places
  for select using (published = true);
drop policy if exists "Owners can add places" on public.places;
create policy "Owners can add places" on public.places
  for insert to authenticated with check (auth.uid() = owner_id and published = true);
drop policy if exists "Owners can edit places" on public.places;
create policy "Owners can edit places" on public.places
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Owners can delete places" on public.places;
create policy "Owners can delete places" on public.places
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "Published profiles are public" on public.profiles;
create policy "Published profiles are public" on public.profiles
  for select using (published = true);
drop policy if exists "Owners can add profiles" on public.profiles;
create policy "Owners can add profiles" on public.profiles
  for insert to authenticated with check (auth.uid() = owner_id and published = true);
drop policy if exists "Owners can edit profiles" on public.profiles;
create policy "Owners can edit profiles" on public.profiles
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Owners can delete profiles" on public.profiles;
create policy "Owners can delete profiles" on public.profiles
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "Attendance is public" on public.place_attendance;
create policy "Attendance is public" on public.place_attendance
  for select using (true);
drop policy if exists "Members can mark their attendance" on public.place_attendance;
create policy "Members can mark their attendance" on public.place_attendance
  for insert to authenticated with check (
    auth.uid() = owner_id and exists (
      select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()
    )
  );
drop policy if exists "Members can cancel their attendance" on public.place_attendance;
create policy "Members can cancel their attendance" on public.place_attendance
  for delete to authenticated using (auth.uid() = owner_id);

grant select on public.places, public.profiles, public.place_attendance to anon, authenticated;
grant insert, update, delete on public.places, public.profiles to authenticated;
grant insert, delete on public.place_attendance to authenticated;

-- Legacy rows from the Paris demo can be classified as Paris. Other unknown rows
-- stay unclassified until their owner updates them or supplies a department.
update public.places set department = '75'
where department is null and (address ilike '%paris%' or address ~ '\m75[0-9]{3}\M');
