begin;

create table if not exists public.billing_accounts (
    user_id uuid primary key references auth.users (id) on delete cascade,
    provider text not null default 'stripe' check (provider in ('stripe')),
    stripe_customer_id text unique,
    stripe_subscription_id text unique,
    stripe_price_id text,
    subscription_status text not null default 'inactive',
    entitlement_active boolean not null default false,
    current_period_end timestamptz,
    last_event_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists set_billing_accounts_updated_at on public.billing_accounts;
create trigger set_billing_accounts_updated_at
before update on public.billing_accounts
for each row execute function public.set_updated_at();

alter table public.billing_accounts enable row level security;

drop policy if exists "billing_accounts_select_own" on public.billing_accounts;
create policy "billing_accounts_select_own"
on public.billing_accounts
for select
using (auth.uid() = user_id);

update public.entitlements
set updated_at = now()
where plan = 'plus' and cloud_sync_enabled = true;

commit;
