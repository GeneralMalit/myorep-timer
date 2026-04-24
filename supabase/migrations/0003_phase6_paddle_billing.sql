begin;

alter table public.billing_accounts
drop constraint if exists billing_accounts_provider_check;

alter table public.billing_accounts
alter column provider set default 'paddle';

update public.billing_accounts
set provider = 'paddle'
where provider = 'stripe';

alter table public.billing_accounts
add constraint billing_accounts_provider_check
check (provider in ('paddle'));

alter table public.billing_accounts
rename column stripe_customer_id to paddle_customer_id;

alter table public.billing_accounts
rename column stripe_subscription_id to paddle_subscription_id;

alter table public.billing_accounts
rename column stripe_price_id to paddle_price_id;

alter table public.billing_accounts
drop column if exists entitlement_active;

alter table public.billing_accounts
add column if not exists last_event_occurred_at timestamptz;

commit;
