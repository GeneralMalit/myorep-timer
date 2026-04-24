begin;

alter table public.profiles
    add column if not exists username text;

with normalized_profiles as (
    select
        id,
        lower(
            left(
                trim(both '_' from regexp_replace(
                    coalesce(nullif(display_name, ''), nullif(split_part(coalesce(email, ''), '@', 1), ''), 'athlete'),
                    '[^a-zA-Z0-9]+',
                    '_',
                    'g'
                )),
                24
            )
        ) as base_username
    from public.profiles
),
prepared_usernames as (
    select
        id,
        case
            when char_length(base_username) >= 3 then base_username
            else 'athlete'
        end as base_username
    from normalized_profiles
),
deduplicated_usernames as (
    select
        id,
        case
            when row_number() over (partition by base_username order by id) = 1 then base_username
            else left(base_username, 20) || '_' || (row_number() over (partition by base_username order by id) - 1)::text
        end as resolved_username
    from prepared_usernames
)
update public.profiles as profiles
set
    username = deduplicated_usernames.resolved_username,
    display_name = coalesce(profiles.display_name, deduplicated_usernames.resolved_username),
    updated_at = now()
from deduplicated_usernames
where profiles.id = deduplicated_usernames.id
  and profiles.username is null;

alter table public.profiles
    alter column username set not null;

alter table public.profiles
    drop constraint if exists profiles_username_format;

alter table public.profiles
    add constraint profiles_username_format
    check (username ~ '^[a-z0-9_]{3,24}$');

create unique index if not exists profiles_username_lower_key
    on public.profiles (lower(username));

commit;
