import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/0006_sync_consistency_rpc.sql'),
    'utf8',
);

describe('sync consistency migration contract', () => {
    it('enforces expected revisions server-side and returns typed stale conflicts', () => {
        expect(migration).toContain('p_expected_revision bigint');
        expect(migration).toContain('for update;');
        expect(migration).toContain('if v_incoming_revision < v_current.revision then');
        expect(migration).toContain("'reason', 'stale_revision'");
        expect(migration).toContain("'reason', 'revision_mismatch'");
    });

    it('makes tombstones win and prevents direct authenticated writes from bypassing CAS', () => {
        expect(migration).toContain('v_current.deleted_at is not null and v_deleted_at is null');
        expect(migration).toContain("'reason', 'tombstone_wins'");
        expect(migration).toContain('Concurrent mutations from the same base revision use delete-wins tie breaking.');
        expect(migration).toContain('revoke insert, update, delete on table public.saved_workouts from anon, authenticated;');
        expect(migration).toContain('revoke insert, update, delete on table public.saved_sessions from anon, authenticated;');
    });

    it('keeps RPCs authenticated and first-sync overwrite in one locked transaction', () => {
        expect(migration).toContain('security definer');
        expect(migration).toContain("v_user_id uuid := auth.uid();");
        expect(migration).toContain("set search_path = ''");
        expect(migration).toContain('create or replace function public.overwrite_sync_library(');
        expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
        expect(migration).toContain('grant execute on function public.overwrite_sync_library(jsonb, jsonb) to authenticated;');
    });
});
