begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text,
    display_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.entitlements (
    user_id uuid primary key references auth.users (id) on delete cascade,
    plan text not null default 'free' check (plan in ('free', 'plus')),
    cloud_sync_enabled boolean not null default false,
    updated_at timestamptz not null default now()
);

create table if not exists public.saved_workouts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    local_id text not null,
    name text not null,
    sets text not null,
    reps text not null,
    seconds text not null,
    rest text not null,
    myo_reps text not null,
    myo_work_secs text not null,
    times_used integer not null default 0,
    last_used_at timestamptz,
    revision bigint not null default 1,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, local_id)
);

create index if not exists saved_workouts_user_updated_idx
    on public.saved_workouts (user_id, updated_at desc);

create index if not exists saved_workouts_user_deleted_idx
    on public.saved_workouts (user_id, deleted_at)
    where deleted_at is not null;

create table if not exists public.saved_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    local_id text not null,
    name text not null,
    nodes jsonb not null default '[]'::jsonb,
    times_used integer not null default 0,
    last_used_at timestamptz,
    revision bigint not null default 1,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, local_id)
);

create index if not exists saved_sessions_user_updated_idx
    on public.saved_sessions (user_id, updated_at desc);

create index if not exists saved_sessions_user_deleted_idx
    on public.saved_sessions (user_id, deleted_at)
    where deleted_at is not null;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_entitlements_updated_at on public.entitlements;
create trigger set_entitlements_updated_at
before update on public.entitlements
for each row execute function public.set_updated_at();

drop trigger if exists set_saved_workouts_updated_at on public.saved_workouts;
create trigger set_saved_workouts_updated_at
before update on public.saved_workouts
for each row execute function public.set_updated_at();

drop trigger if exists set_saved_sessions_updated_at on public.saved_sessions;
create trigger set_saved_sessions_updated_at
before update on public.saved_sessions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;
alter table public.saved_workouts enable row level security;
alter table public.saved_sessions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "entitlements_select_own" on public.entitlements;
create policy "entitlements_select_own"
on public.entitlements
for select
using (auth.uid() = user_id);

drop policy if exists "entitlements_insert_own" on public.entitlements;
create policy "entitlements_insert_own"
on public.entitlements
for insert
with check (auth.uid() = user_id);

drop policy if exists "entitlements_update_own" on public.entitlements;
create policy "entitlements_update_own"
on public.entitlements
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "saved_workouts_select_own" on public.saved_workouts;
create policy "saved_workouts_select_own"
on public.saved_workouts
for select
using (auth.uid() = user_id);

drop policy if exists "saved_workouts_insert_own" on public.saved_workouts;
create policy "saved_workouts_insert_own"
on public.saved_workouts
for insert
with check (auth.uid() = user_id);

drop policy if exists "saved_workouts_update_own" on public.saved_workouts;
create policy "saved_workouts_update_own"
on public.saved_workouts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "saved_workouts_delete_own" on public.saved_workouts;
create policy "saved_workouts_delete_own"
on public.saved_workouts
for delete
using (auth.uid() = user_id);

drop policy if exists "saved_sessions_select_own" on public.saved_sessions;
create policy "saved_sessions_select_own"
on public.saved_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "saved_sessions_insert_own" on public.saved_sessions;
create policy "saved_sessions_insert_own"
on public.saved_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "saved_sessions_update_own" on public.saved_sessions;
create policy "saved_sessions_update_own"
on public.saved_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "saved_sessions_delete_own" on public.saved_sessions;
create policy "saved_sessions_delete_own"
on public.saved_sessions
for delete
using (auth.uid() = user_id);

commit;
