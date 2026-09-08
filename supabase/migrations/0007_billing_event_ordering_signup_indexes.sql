begin;

drop index if exists public.profiles_username_lower_key;

create unique index if not exists profiles_username_key
    on public.profiles (username);

create index if not exists auth_users_email_lower_lookup_idx
    on auth.users (lower(email))
    where email is not null;

create or replace function public.get_password_signup_availability(
    p_email text,
    p_username text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    normalized_email text := lower(trim(p_email));
    normalized_username text := lower(trim(p_username));
    email_taken boolean;
    username_taken boolean;
begin
    select
        exists (
            select 1
            from public.profiles
            where username = normalized_username
        ),
        exists (
            select 1
            from auth.users
            where lower(email) = normalized_email
        )
    into username_taken, email_taken;

    if username_taken then
        return 'username_taken';
    end if;

    if email_taken then
        return 'email_taken';
    end if;

    return 'available';
end;
$$;

revoke all on function public.get_password_signup_availability(text, text)
    from public, anon, authenticated;
grant execute on function public.get_password_signup_availability(text, text)
    to service_role;

create or replace function public.refresh_resolved_entitlement(
    p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    billing_status text;
    resolved_plan text := 'free';
    resolved_cloud_sync_enabled boolean := false;
    current_plan text;
    current_cloud_sync_enabled boolean;
    current_updated_at timestamptz;
begin
    if p_user_id is null then
        raise exception 'Entitlement user id is required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    select
        plan,
        cloud_sync_enabled
    into
        resolved_plan,
        resolved_cloud_sync_enabled
    from public.entitlement_overrides
    where user_id = p_user_id
      and (expires_at is null or expires_at > now());

    if not found then
        resolved_plan := 'free';
        resolved_cloud_sync_enabled := false;

        select subscription_status
        into billing_status
        from public.billing_accounts
        where user_id = p_user_id;

        if found and billing_status in ('active', 'trialing') then
            resolved_plan := 'plus';
            resolved_cloud_sync_enabled := true;
        end if;
    end if;

    select
        plan,
        cloud_sync_enabled,
        updated_at
    into
        current_plan,
        current_cloud_sync_enabled,
        current_updated_at
    from public.entitlements
    where user_id = p_user_id;

    if found
       and current_plan = resolved_plan
       and current_cloud_sync_enabled = resolved_cloud_sync_enabled then
        return pg_catalog.jsonb_build_object(
            'user_id', p_user_id,
            'plan', current_plan,
            'cloud_sync_enabled', current_cloud_sync_enabled,
            'updated_at', current_updated_at
        );
    end if;

    insert into public.entitlements (
        user_id,
        plan,
        cloud_sync_enabled,
        updated_at
    )
    values (
        p_user_id,
        resolved_plan,
        resolved_cloud_sync_enabled,
        now()
    )
    on conflict (user_id) do update
    set
        plan = excluded.plan,
        cloud_sync_enabled = excluded.cloud_sync_enabled,
        updated_at = excluded.updated_at
    returning
        plan,
        cloud_sync_enabled,
        updated_at
    into
        current_plan,
        current_cloud_sync_enabled,
        current_updated_at;

    return pg_catalog.jsonb_build_object(
        'user_id', p_user_id,
        'plan', current_plan,
        'cloud_sync_enabled', current_cloud_sync_enabled,
        'updated_at', current_updated_at
    );
end;
$$;

revoke all on function public.refresh_resolved_entitlement(uuid)
    from public, anon, authenticated;
grant execute on function public.refresh_resolved_entitlement(uuid)
    to service_role;

create table if not exists public.paddle_webhook_events (
    event_id text primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    event_type text not null,
    occurred_at timestamptz not null,
    disposition text not null default 'received'
        check (disposition in ('received', 'applied', 'stale')),
    received_at timestamptz not null default now()
);

create index if not exists paddle_webhook_events_user_occurred_idx
    on public.paddle_webhook_events (user_id, occurred_at desc, event_id desc);

alter table public.paddle_webhook_events enable row level security;

revoke all on table public.paddle_webhook_events from public, anon, authenticated;

create or replace function public.apply_paddle_subscription_event(
    p_event_id text,
    p_event_type text,
    p_occurred_at timestamptz,
    p_user_id uuid,
    p_paddle_customer_id text,
    p_paddle_subscription_id text,
    p_paddle_price_id text,
    p_subscription_status text,
    p_current_period_end timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    inserted_event_id text;
    previous_event_id text;
    previous_occurred_at timestamptz;
    resolved_plan text;
    resolved_cloud_sync_enabled boolean;
begin
    if nullif(trim(p_event_id), '') is null then
        raise exception 'Paddle event id is required.';
    end if;

    if nullif(trim(p_event_type), '') is null then
        raise exception 'Paddle event type is required.';
    end if;

    if p_occurred_at is null then
        raise exception 'Paddle event occurred_at is required.';
    end if;

    if p_user_id is null then
        raise exception 'Paddle event user id is required.';
    end if;

    insert into public.paddle_webhook_events (
        event_id,
        user_id,
        event_type,
        occurred_at
    )
    values (
        p_event_id,
        p_user_id,
        p_event_type,
        p_occurred_at
    )
    on conflict (event_id) do nothing
    returning event_id into inserted_event_id;

    if inserted_event_id is null then
        return 'duplicate';
    end if;

    -- Serialize different events for the same account even when the billing row
    -- does not exist yet. The event ledger's primary key separately serializes
    -- concurrent deliveries of the same Paddle event.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    select
        last_event_id,
        last_event_occurred_at
    into
        previous_event_id,
        previous_occurred_at
    from public.billing_accounts
    where user_id = p_user_id
    for update;

    if previous_occurred_at is not null and (
        p_occurred_at < previous_occurred_at
        or (
            p_occurred_at = previous_occurred_at
            and p_event_id <= coalesce(previous_event_id, '')
        )
    ) then
        update public.paddle_webhook_events
        set disposition = 'stale'
        where event_id = p_event_id;

        return 'stale';
    end if;

    insert into public.billing_accounts (
        user_id,
        provider,
        paddle_customer_id,
        paddle_subscription_id,
        paddle_price_id,
        subscription_status,
        current_period_end,
        last_event_id,
        last_event_occurred_at
    )
    values (
        p_user_id,
        'paddle',
        p_paddle_customer_id,
        p_paddle_subscription_id,
        p_paddle_price_id,
        p_subscription_status,
        p_current_period_end,
        p_event_id,
        p_occurred_at
    )
    on conflict (user_id) do update
    set
        provider = 'paddle',
        paddle_customer_id = coalesce(
            excluded.paddle_customer_id,
            billing_accounts.paddle_customer_id
        ),
        paddle_subscription_id = excluded.paddle_subscription_id,
        paddle_price_id = excluded.paddle_price_id,
        subscription_status = excluded.subscription_status,
        current_period_end = excluded.current_period_end,
        last_event_id = excluded.last_event_id,
        last_event_occurred_at = excluded.last_event_occurred_at;

    select
        plan,
        cloud_sync_enabled
    into
        resolved_plan,
        resolved_cloud_sync_enabled
    from public.entitlement_overrides
    where user_id = p_user_id
      and (expires_at is null or expires_at > now());

    if not found then
        resolved_plan := case
            when p_subscription_status in ('active', 'trialing') then 'plus'
            else 'free'
        end;
        resolved_cloud_sync_enabled := p_subscription_status in ('active', 'trialing');
    end if;

    insert into public.entitlements (
        user_id,
        plan,
        cloud_sync_enabled,
        updated_at
    )
    values (
        p_user_id,
        resolved_plan,
        resolved_cloud_sync_enabled,
        now()
    )
    on conflict (user_id) do update
    set
        plan = excluded.plan,
        cloud_sync_enabled = excluded.cloud_sync_enabled,
        updated_at = excluded.updated_at;

    update public.paddle_webhook_events
    set disposition = 'applied'
    where event_id = p_event_id;

    return 'applied';
end;
$$;

revoke all on function public.apply_paddle_subscription_event(
    text,
    text,
    timestamptz,
    uuid,
    text,
    text,
    text,
    text,
    timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_paddle_subscription_event(
    text,
    text,
    timestamptz,
    uuid,
    text,
    text,
    text,
    text,
    timestamptz
) to service_role;

commit;
