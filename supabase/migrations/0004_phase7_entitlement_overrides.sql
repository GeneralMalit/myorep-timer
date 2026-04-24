begin;

create table if not exists public.entitlement_overrides (
    user_id uuid primary key references auth.users (id) on delete cascade,
    plan text not null default 'free' check (plan in ('free', 'plus')),
    cloud_sync_enabled boolean not null default false,
    reason text not null,
    granted_by_email text not null,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists set_entitlement_overrides_updated_at on public.entitlement_overrides;
create trigger set_entitlement_overrides_updated_at
before update on public.entitlement_overrides
for each row execute function public.set_updated_at();

alter table public.entitlement_overrides enable row level security;

drop policy if exists "entitlements_select_own" on public.entitlements;
create policy "entitlements_select_own"
on public.entitlements
for select
using (auth.uid() = user_id);

drop policy if exists "entitlements_insert_own" on public.entitlements;
drop policy if exists "entitlements_update_own" on public.entitlements;

commit;
