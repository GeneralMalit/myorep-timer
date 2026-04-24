# Phase 1 Persistence Model

## Scope
- Phase 1 separates the app into runtime-only timer state, local persisted preferences/config, and syncable user library data.
- The existing workout engine remains the runtime source of truth for active timers and session execution.
- Saved workouts and saved sessions become the canonical library entities for local storage, import/export, and future Supabase sync.

## Store Boundary
- Runtime-only state stays transient:
  - timer phase/status
  - active timer baselines and elapsed values
  - active session execution state
  - in-progress builder/editor selection state
  - import summaries
- Local persisted preferences/config stay in Zustand persistence:
  - `settings`
  - current workout config fields
  - `theme`
  - selected saved workout/session ids
  - `setupMode`
- Syncable library data stays persisted and versioned:
  - `savedWorkouts`
  - `savedSessions`

## Canonical Local Model
- `SavedWorkout` and `SavedSession` are the canonical local entities.
- Both entities carry sync metadata so they can move between:
  - local persistence
  - import/export payloads
  - Supabase rows
- Sync metadata fields are:
  - `localId`
  - `remoteId`
  - `revision`
  - `updatedAt`
  - `dirty`
  - `pendingDelete`
  - `deletedAt`
  - `lastSyncedAt`

## Import / Export Contract
- Workout and session exports remain schema-versioned.
- Export records always normalize missing sync metadata before serialization.
- Import accepts the current schema payloads plus migration-friendly wrappers like nested `data.*` collections or bare arrays.
- Import normalization backfills missing sync metadata so legacy local exports can still be upgraded into the new model.

## Supabase Representation
- Workouts map to `saved_workouts`.
- Sessions map to `saved_sessions`.
- Remote rows use:
  - local id for client identity continuity
  - optional remote id for row identity
  - revision and updated timestamp for conflict resolution
  - soft-delete tombstones through `deleted_at`
- The client write shape is explicit in `src/types/sync.ts` and `src/utils/sync.ts`.

## Conflict Handling
- Phase 1 locks v1 conflict handling to last-write-wins.
- The deciding fields are:
  - `revision`
  - `updatedAt`
- This keeps sync behavior single-user and predictable until a richer reconciliation model is needed.

## Guest Upgrade Path
- Guest users keep local persisted libraries exactly as they do today.
- On sign-in, local workouts and sessions remain the source dataset until sync is enabled for that account.
- When cloud sync is available, local entities upload using:
  - their existing `localId`
  - `remoteId = null` until the first successful server write
  - `dirty = true` until the record is acknowledged by Supabase
- This preserves migration safety and avoids destroying guest data during account bootstrap.
