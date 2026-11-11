-- Supabase: exécuter dans SQL Editor après création d’un projet.
-- Données publiques et déclaratives : ne publier aucune adresse privée ni donnée sensible.
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
  area text not null default 'center',
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 40),
  study text not null default '' check (char_length(study) <= 80),
  area text not null check (char_length(area) between 1 and 60),
  days text[] not null default '{}',
  subjects jsonb not null default '{}'::jsonb,
  groups text[] not null default '{}',
  needs text not null default '' check (char_length(needs) <= 180),
  contact text not null default '' check (char_length(contact) <= 100),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.places enable row level security;
alter table public.profiles enable row level security;

create policy "Anyone can read published places" on public.places for select using (published = true);
create policy "Anyone can suggest a place" on public.places for insert with check (published = true);
create policy "Anyone can read published profiles" on public.profiles for select using (published = true);
create policy "Anyone can create a profile" on public.profiles for insert with check (published = true);

grant select, insert on public.places to anon, authenticated;
grant select, insert on public.profiles to anon, authenticated;

-- This starter schema is public: anyone with access can view all published fields.
-- Before real-world use, add authenticated ownership, abuse controls, and a deletion workflow.
