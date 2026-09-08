begin;

create index if not exists saved_workouts_user_active_local_idx
    on public.saved_workouts (user_id, local_id)
    include (id, revision, updated_at)
    where deleted_at is null;

create index if not exists saved_sessions_user_active_local_idx
    on public.saved_sessions (user_id, local_id)
    include (id, revision, updated_at)
    where deleted_at is null;

create or replace function public.mutate_saved_workout(
    p_expected_revision bigint,
    p_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_supplied_user_id uuid;
    v_local_id text;
    v_name text;
    v_sets text;
    v_reps text;
    v_seconds text;
    v_rest text;
    v_myo_reps text;
    v_myo_work_secs text;
    v_times_used integer;
    v_last_used_at timestamptz;
    v_incoming_revision bigint;
    v_deleted_at timestamptz;
    v_current public.saved_workouts%rowtype;
    v_written public.saved_workouts%rowtype;
begin
    if v_user_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required to mutate synced workouts.';
    end if;

    if p_row is null or jsonb_typeof(p_row) <> 'object' then
        raise exception using
            errcode = '22023',
            message = 'Workout mutation payload must be a JSON object.';
    end if;

    if p_expected_revision is null
       or p_expected_revision < 0
       or p_expected_revision > 9007199254740991 then
        raise exception using
            errcode = '22023',
            message = 'Expected workout revision must be a non-negative safe integer.';
    end if;

    v_supplied_user_id := nullif(p_row ->> 'user_id', '')::uuid;
    if v_supplied_user_id is distinct from v_user_id then
        raise exception using
            errcode = '42501',
            message = 'Workout mutation user does not match the authenticated user.';
    end if;

    v_local_id := nullif(btrim(p_row ->> 'local_id'), '');
    v_name := p_row ->> 'name';
    v_sets := p_row ->> 'sets';
    v_reps := p_row ->> 'reps';
    v_seconds := p_row ->> 'seconds';
    v_rest := p_row ->> 'rest';
    v_myo_reps := p_row ->> 'myo_reps';
    v_myo_work_secs := p_row ->> 'myo_work_secs';
    v_times_used := coalesce((p_row ->> 'times_used')::integer, 0);
    v_last_used_at := nullif(p_row ->> 'last_used_at', '')::timestamptz;
    v_incoming_revision := (p_row ->> 'revision')::bigint;
    v_deleted_at := nullif(p_row ->> 'deleted_at', '')::timestamptz;

    if v_local_id is null
       or v_name is null
       or v_sets is null
       or v_reps is null
       or v_seconds is null
       or v_rest is null
       or v_myo_reps is null
       or v_myo_work_secs is null then
        raise exception using
            errcode = '22023',
            message = 'Workout mutation payload is missing required fields.';
    end if;

    if v_incoming_revision is null
       or v_incoming_revision <= 0
       or v_incoming_revision > 9007199254740991 then
        raise exception using
            errcode = '22023',
            message = 'Incoming workout revision must be a positive safe integer.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_user_id::text, 709377)
    );

    select workout.*
    into v_current
    from public.saved_workouts as workout
    where workout.user_id = v_user_id
      and workout.local_id = v_local_id
    for update;

    if not found then
        if p_expected_revision <> 0 then
            return jsonb_build_object(
                'status', 'conflict',
                'reason', 'revision_mismatch',
                'expected_revision', p_expected_revision,
                'remote_revision', 0,
                'remote_deleted_at', null::text,
                'remote_record', null::jsonb
            );
        end if;

        insert into public.saved_workouts (
            user_id,
            local_id,
            name,
            sets,
            reps,
            seconds,
            rest,
            myo_reps,
            myo_work_secs,
            times_used,
            last_used_at,
            revision,
            deleted_at
        ) values (
            v_user_id,
            v_local_id,
            v_name,
            v_sets,
            v_reps,
            v_seconds,
            v_rest,
            v_myo_reps,
            v_myo_work_secs,
            v_times_used,
            v_last_used_at,
            v_incoming_revision,
            v_deleted_at
        )
        returning * into v_written;

        return jsonb_build_object(
            'status', case when v_written.deleted_at is null then 'applied' else 'deleted' end,
            'reason', null::text,
            'expected_revision', p_expected_revision,
            'remote_revision', v_written.revision,
            'remote_deleted_at', v_written.deleted_at,
            'remote_record', to_jsonb(v_written)
        );
    end if;

    -- Tombstones cannot be cleared by a later upsert. There is no undelete operation.
    if v_current.deleted_at is not null and v_deleted_at is null then
        return jsonb_build_object(
            'status', 'conflict',
            'reason', 'tombstone_wins',
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if v_incoming_revision < v_current.revision then
        return jsonb_build_object(
            'status', 'conflict',
            'reason', 'stale_revision',
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    -- Replaying an accepted tombstone is idempotent.
    if v_current.deleted_at is not null
       and v_deleted_at is not null
       and v_incoming_revision = v_current.revision then
        return jsonb_build_object(
            'status', 'deleted',
            'reason', null::text,
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    -- Concurrent mutations from the same base revision use delete-wins tie breaking.
    if v_current.deleted_at is null
       and v_deleted_at is not null
       and v_incoming_revision = v_current.revision then
        update public.saved_workouts
        set deleted_at = v_deleted_at
        where user_id = v_user_id
          and local_id = v_local_id
        returning * into v_written;

        return jsonb_build_object(
            'status', 'deleted',
            'reason', null::text,
            'expected_revision', p_expected_revision,
            'remote_revision', v_written.revision,
            'remote_deleted_at', v_written.deleted_at,
            'remote_record', to_jsonb(v_written)
        );
    end if;

    -- A retry after a committed response was lost is safe when its content matches.
    if v_current.deleted_at is null
       and v_deleted_at is null
       and v_incoming_revision = v_current.revision
       and v_current.name is not distinct from v_name
       and v_current.sets is not distinct from v_sets
       and v_current.reps is not distinct from v_reps
       and v_current.seconds is not distinct from v_seconds
       and v_current.rest is not distinct from v_rest
       and v_current.myo_reps is not distinct from v_myo_reps
       and v_current.myo_work_secs is not distinct from v_myo_work_secs
       and v_current.times_used is not distinct from v_times_used
       and v_current.last_used_at is not distinct from v_last_used_at then
        return jsonb_build_object(
            'status', 'applied',
            'reason', null::text,
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', null::text,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if v_incoming_revision = v_current.revision
       or p_expected_revision < v_current.revision then
        return jsonb_build_object(
            'status', 'conflict',
            'reason', 'stale_revision',
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if p_expected_revision <> v_current.revision then
        return jsonb_build_object(
            'status', 'conflict',
            'reason', 'revision_mismatch',
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if v_deleted_at is not null then
        update public.saved_workouts
        set
            revision = v_incoming_revision,
            deleted_at = v_deleted_at
        where user_id = v_user_id
          and local_id = v_local_id
        returning * into v_written;
    else
        update public.saved_workouts
        set
            name = v_name,
            sets = v_sets,
            reps = v_reps,
            seconds = v_seconds,
            rest = v_rest,
            myo_reps = v_myo_reps,
            myo_work_secs = v_myo_work_secs,
            times_used = v_times_used,
            last_used_at = v_last_used_at,
            revision = v_incoming_revision,
            deleted_at = null
        where user_id = v_user_id
          and local_id = v_local_id
        returning * into v_written;
    end if;

    return jsonb_build_object(
        'status', case when v_written.deleted_at is null then 'applied' else 'deleted' end,
        'reason', null::text,
        'expected_revision', p_expected_revision,
        'remote_revision', v_written.revision,
        'remote_deleted_at', v_written.deleted_at,
        'remote_record', to_jsonb(v_written)
    );
end;
$$;

create or replace function public.mutate_saved_session(
    p_expected_revision bigint,
    p_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_supplied_user_id uuid;
    v_local_id text;
    v_name text;
    v_nodes jsonb;
    v_times_used integer;
    v_last_used_at timestamptz;
    v_incoming_revision bigint;
    v_deleted_at timestamptz;
    v_current public.saved_sessions%rowtype;
    v_written public.saved_sessions%rowtype;
begin
    if v_user_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required to mutate synced sessions.';
    end if;

    if p_row is null or jsonb_typeof(p_row) <> 'object' then
        raise exception using
            errcode = '22023',
            message = 'Session mutation payload must be a JSON object.';
    end if;

    if p_expected_revision is null
       or p_expected_revision < 0
       or p_expected_revision > 9007199254740991 then
        raise exception using
            errcode = '22023',
            message = 'Expected session revision must be a non-negative safe integer.';
    end if;

    v_supplied_user_id := nullif(p_row ->> 'user_id', '')::uuid;
    if v_supplied_user_id is distinct from v_user_id then
        raise exception using
            errcode = '42501',
            message = 'Session mutation user does not match the authenticated user.';
    end if;

    v_local_id := nullif(btrim(p_row ->> 'local_id'), '');
    v_name := p_row ->> 'name';
    v_nodes := p_row -> 'nodes';
    v_times_used := coalesce((p_row ->> 'times_used')::integer, 0);
    v_last_used_at := nullif(p_row ->> 'last_used_at', '')::timestamptz;
    v_incoming_revision := (p_row ->> 'revision')::bigint;
    v_deleted_at := nullif(p_row ->> 'deleted_at', '')::timestamptz;

    if v_local_id is null or v_name is null then
        raise exception using
            errcode = '22023',
            message = 'Session mutation payload is missing required fields.';
    end if;

    if v_nodes is null or jsonb_typeof(v_nodes) <> 'array' then
        raise exception using
            errcode = '22023',
            message = 'Session nodes must be a JSON array.';
    end if;

    if v_incoming_revision is null
       or v_incoming_revision <= 0
       or v_incoming_revision > 9007199254740991 then
        raise exception using
            errcode = '22023',
            message = 'Incoming session revision must be a positive safe integer.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_user_id::text, 709377)
    );

    select session.*
    into v_current
    from public.saved_sessions as session
    where session.user_id = v_user_id
      and session.local_id = v_local_id
    for update;

    if not found then
        if p_expected_revision <> 0 then
            return jsonb_build_object(
                'status', 'conflict',
                'reason', 'revision_mismatch',
                'expected_revision', p_expected_revision,
                'remote_revision', 0,
                'remote_deleted_at', null::text,
                'remote_record', null::jsonb
            );
        end if;

        insert into public.saved_sessions (
            user_id,
            local_id,
            name,
            nodes,
            times_used,
            last_used_at,
            revision,
            deleted_at
        ) values (
            v_user_id,
            v_local_id,
            v_name,
            v_nodes,
            v_times_used,
            v_last_used_at,
            v_incoming_revision,
            v_deleted_at
        )
        returning * into v_written;

        return jsonb_build_object(
            'status', case when v_written.deleted_at is null then 'applied' else 'deleted' end,
            'reason', null::text,
            'expected_revision', p_expected_revision,
            'remote_revision', v_written.revision,
            'remote_deleted_at', v_written.deleted_at,
            'remote_record', to_jsonb(v_written)
        );
    end if;

    if v_current.deleted_at is not null and v_deleted_at is null then
        return jsonb_build_object(
            'status', 'conflict',
            'reason', 'tombstone_wins',
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if v_incoming_revision < v_current.revision then
        return jsonb_build_object(
            'status', 'conflict',
            'reason', 'stale_revision',
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if v_current.deleted_at is not null
       and v_deleted_at is not null
       and v_incoming_revision = v_current.revision then
        return jsonb_build_object(
            'status', 'deleted',
            'reason', null::text,
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if v_current.deleted_at is null
       and v_deleted_at is not null
       and v_incoming_revision = v_current.revision then
        update public.saved_sessions
        set deleted_at = v_deleted_at
        where user_id = v_user_id
          and local_id = v_local_id
        returning * into v_written;

        return jsonb_build_object(
            'status', 'deleted',
            'reason', null::text,
            'expected_revision', p_expected_revision,
            'remote_revision', v_written.revision,
            'remote_deleted_at', v_written.deleted_at,
            'remote_record', to_jsonb(v_written)
        );
    end if;

    if v_current.deleted_at is null
       and v_deleted_at is null
       and v_incoming_revision = v_current.revision
       and v_current.name is not distinct from v_name
       and v_current.nodes is not distinct from v_nodes
       and v_current.times_used is not distinct from v_times_used
       and v_current.last_used_at is not distinct from v_last_used_at then
        return jsonb_build_object(
            'status', 'applied',
            'reason', null::text,
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', null::text,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if v_incoming_revision = v_current.revision
       or p_expected_revision < v_current.revision then
        return jsonb_build_object(
            'status', 'conflict',
            'reason', 'stale_revision',
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if p_expected_revision <> v_current.revision then
        return jsonb_build_object(
            'status', 'conflict',
            'reason', 'revision_mismatch',
            'expected_revision', p_expected_revision,
            'remote_revision', v_current.revision,
            'remote_deleted_at', v_current.deleted_at,
            'remote_record', to_jsonb(v_current)
        );
    end if;

    if v_deleted_at is not null then
        update public.saved_sessions
        set
            revision = v_incoming_revision,
            deleted_at = v_deleted_at
        where user_id = v_user_id
          and local_id = v_local_id
        returning * into v_written;
    else
        update public.saved_sessions
        set
            name = v_name,
            nodes = v_nodes,
            times_used = v_times_used,
            last_used_at = v_last_used_at,
            revision = v_incoming_revision,
            deleted_at = null
        where user_id = v_user_id
          and local_id = v_local_id
        returning * into v_written;
    end if;

    return jsonb_build_object(
        'status', case when v_written.deleted_at is null then 'applied' else 'deleted' end,
        'reason', null::text,
        'expected_revision', p_expected_revision,
        'remote_revision', v_written.revision,
        'remote_deleted_at', v_written.deleted_at,
        'remote_record', to_jsonb(v_written)
    );
end;
$$;

create or replace function public.overwrite_sync_library(
    p_workouts jsonb,
    p_sessions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_item jsonb;
    v_supplied_user_id uuid;
    v_local_id text;
    v_revision bigint;
    v_nodes jsonb;
    v_workouts jsonb;
    v_sessions jsonb;
begin
    if v_user_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required to overwrite the sync library.';
    end if;

    if p_workouts is null or jsonb_typeof(p_workouts) <> 'array'
       or p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
        raise exception using
            errcode = '22023',
            message = 'First-sync workout and session payloads must be JSON arrays.';
    end if;

    if jsonb_array_length(p_workouts) > 5000
       or jsonb_array_length(p_sessions) > 5000 then
        raise exception using
            errcode = '22023',
            message = 'First-sync payload exceeds the 5000-record per-entity limit.';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(p_workouts) as item(value)
        where jsonb_typeof(item.value) <> 'object'
           or nullif(btrim(item.value ->> 'local_id'), '') is null
    ) or exists (
        select 1
        from jsonb_array_elements(p_sessions) as item(value)
        where jsonb_typeof(item.value) <> 'object'
           or nullif(btrim(item.value ->> 'local_id'), '') is null
    ) then
        raise exception using
            errcode = '22023',
            message = 'First-sync records must be objects with non-empty local IDs.';
    end if;

    if exists (
        select item.value ->> 'local_id'
        from jsonb_array_elements(p_workouts) as item(value)
        group by item.value ->> 'local_id'
        having count(*) > 1
    ) or exists (
        select item.value ->> 'local_id'
        from jsonb_array_elements(p_sessions) as item(value)
        group by item.value ->> 'local_id'
        having count(*) > 1
    ) then
        raise exception using
            errcode = '22023',
            message = 'First-sync payload contains duplicate local IDs.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_user_id::text, 709377)
    );

    for v_item in
        select item.value
        from jsonb_array_elements(p_workouts) as item(value)
    loop
        v_supplied_user_id := nullif(v_item ->> 'user_id', '')::uuid;
        if v_supplied_user_id is distinct from v_user_id then
            raise exception using
                errcode = '42501',
                message = 'First-sync workout user does not match the authenticated user.';
        end if;

        if nullif(v_item ->> 'deleted_at', '') is not null then
            raise exception using
                errcode = '22023',
                message = 'First-sync overwrite accepts active workouts only.';
        end if;

        v_local_id := nullif(btrim(v_item ->> 'local_id'), '');
        v_revision := (v_item ->> 'revision')::bigint;
        if v_revision is null or v_revision <= 0 or v_revision > 9007199254740991 then
            raise exception using
                errcode = '22023',
                message = 'First-sync workout revision must be a positive safe integer.';
        end if;

        insert into public.saved_workouts as target (
            user_id,
            local_id,
            name,
            sets,
            reps,
            seconds,
            rest,
            myo_reps,
            myo_work_secs,
            times_used,
            last_used_at,
            revision,
            deleted_at
        ) values (
            v_user_id,
            v_local_id,
            v_item ->> 'name',
            v_item ->> 'sets',
            v_item ->> 'reps',
            v_item ->> 'seconds',
            v_item ->> 'rest',
            v_item ->> 'myo_reps',
            v_item ->> 'myo_work_secs',
            coalesce((v_item ->> 'times_used')::integer, 0),
            nullif(v_item ->> 'last_used_at', '')::timestamptz,
            v_revision,
            null
        )
        on conflict (user_id, local_id) do update
        set
            name = excluded.name,
            sets = excluded.sets,
            reps = excluded.reps,
            seconds = excluded.seconds,
            rest = excluded.rest,
            myo_reps = excluded.myo_reps,
            myo_work_secs = excluded.myo_work_secs,
            times_used = excluded.times_used,
            last_used_at = excluded.last_used_at,
            revision = greatest(target.revision + 1, excluded.revision),
            deleted_at = null;
    end loop;

    for v_item in
        select item.value
        from jsonb_array_elements(p_sessions) as item(value)
    loop
        v_supplied_user_id := nullif(v_item ->> 'user_id', '')::uuid;
        if v_supplied_user_id is distinct from v_user_id then
            raise exception using
                errcode = '42501',
                message = 'First-sync session user does not match the authenticated user.';
        end if;

        if nullif(v_item ->> 'deleted_at', '') is not null then
            raise exception using
                errcode = '22023',
                message = 'First-sync overwrite accepts active sessions only.';
        end if;

        v_local_id := nullif(btrim(v_item ->> 'local_id'), '');
        v_revision := (v_item ->> 'revision')::bigint;
        v_nodes := v_item -> 'nodes';
        if v_revision is null or v_revision <= 0 or v_revision > 9007199254740991 then
            raise exception using
                errcode = '22023',
                message = 'First-sync session revision must be a positive safe integer.';
        end if;
        if v_nodes is null or jsonb_typeof(v_nodes) <> 'array' then
            raise exception using
                errcode = '22023',
                message = 'First-sync session nodes must be a JSON array.';
        end if;

        insert into public.saved_sessions as target (
            user_id,
            local_id,
            name,
            nodes,
            times_used,
            last_used_at,
            revision,
            deleted_at
        ) values (
            v_user_id,
            v_local_id,
            v_item ->> 'name',
            v_nodes,
            coalesce((v_item ->> 'times_used')::integer, 0),
            nullif(v_item ->> 'last_used_at', '')::timestamptz,
            v_revision,
            null
        )
        on conflict (user_id, local_id) do update
        set
            name = excluded.name,
            nodes = excluded.nodes,
            times_used = excluded.times_used,
            last_used_at = excluded.last_used_at,
            revision = greatest(target.revision + 1, excluded.revision),
            deleted_at = null;
    end loop;

    update public.saved_workouts as workout
    set
        revision = workout.revision + 1,
        deleted_at = now()
    where workout.user_id = v_user_id
      and workout.deleted_at is null
      and not exists (
          select 1
          from jsonb_array_elements(p_workouts) as item(value)
          where item.value ->> 'local_id' = workout.local_id
      );

    update public.saved_sessions as session
    set
        revision = session.revision + 1,
        deleted_at = now()
    where session.user_id = v_user_id
      and session.deleted_at is null
      and not exists (
          select 1
          from jsonb_array_elements(p_sessions) as item(value)
          where item.value ->> 'local_id' = session.local_id
      );

    select coalesce(
        jsonb_agg(to_jsonb(workout) order by workout.local_id),
        '[]'::jsonb
    )
    into v_workouts
    from public.saved_workouts as workout
    where workout.user_id = v_user_id
      and workout.deleted_at is null;

    select coalesce(
        jsonb_agg(to_jsonb(session) order by session.local_id),
        '[]'::jsonb
    )
    into v_sessions
    from public.saved_sessions as session
    where session.user_id = v_user_id
      and session.deleted_at is null;

    return jsonb_build_object(
        'workouts', v_workouts,
        'sessions', v_sessions
    );
end;
$$;

-- Mutations must go through the authenticated RPCs above; otherwise callers could
-- bypass compare-and-set by issuing direct PostgREST writes. RLS remains enabled
-- and the existing owner-scoped select policies continue to protect snapshots.
drop policy if exists "saved_workouts_insert_own" on public.saved_workouts;
drop policy if exists "saved_workouts_update_own" on public.saved_workouts;
drop policy if exists "saved_workouts_delete_own" on public.saved_workouts;
drop policy if exists "saved_sessions_insert_own" on public.saved_sessions;
drop policy if exists "saved_sessions_update_own" on public.saved_sessions;
drop policy if exists "saved_sessions_delete_own" on public.saved_sessions;

revoke insert, update, delete on table public.saved_workouts from anon, authenticated;
revoke insert, update, delete on table public.saved_sessions from anon, authenticated;

revoke all on function public.mutate_saved_workout(bigint, jsonb) from public, anon;
revoke all on function public.mutate_saved_session(bigint, jsonb) from public, anon;
revoke all on function public.overwrite_sync_library(jsonb, jsonb) from public, anon;

grant execute on function public.mutate_saved_workout(bigint, jsonb) to authenticated;
grant execute on function public.mutate_saved_session(bigint, jsonb) to authenticated;
grant execute on function public.overwrite_sync_library(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
