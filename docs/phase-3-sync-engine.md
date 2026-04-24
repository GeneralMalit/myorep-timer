# Phase 3 Sync Engine and Migration

## Scope
- Phase 3 adds a manual opt-in cloud sync layer for `savedWorkouts` and `savedSessions`.
- The app stays local-first by default, even for signed-in Plus users.
- Sync UI stays inside the existing sidebar account card and does not redesign the broader mobile UI.

## Sync Model
- Sync is enabled per device, not automatically from entitlement alone.
- Signed-in Plus users see cloud sync as available, but they must explicitly turn it on.
- Once enabled, local edits queue automatically in the background.
- Queue entries are record-level and entity-agnostic:
  - workout upsert
  - workout delete
  - session upsert
  - session delete
- Repeated local edits dedupe to the latest queued write per entity.

## First Sync Flow
- Turning sync on creates a local recovery backup before destructive work begins.
- First enable asks the user to choose one of two directions:
  - `UPLOAD`
    - this device overwrites cloud data
  - `REPLACE`
    - cloud data overwrites this device
- Cancelling the prompt leaves sync off and keeps the device fully local-only.

## Local and Remote Data Rules
- Local IDs stay as the stable client identity for workouts and sessions.
- Remote Supabase IDs stay separate and are stored in sync metadata.
- Existing local records are normalized with sync metadata during hydration and sync operations.
- Session workout node `sourceWorkoutId` continues to point at local workout IDs.
- Import/export remains backup and migration tooling instead of being folded into cloud sync semantics.

## Delete and Recovery Behavior
- When sync is enabled, deletes are tombstoned locally instead of being purged immediately.
- Tombstoned rows are hidden from the visible library, queued for remote delete, and only purged after acknowledgement.
- Turning sync off clears the pending queue and freezes the current local copy on the device.
- Auth-expired errors pause sync and ask the user to re-authenticate.
- Offline/network failures keep local changes usable and retry in the background with backoff.

## UI Surface
- The sidebar account card now shows sync states for signed-in Plus users:
  - sync available but off
  - syncing
  - last synced
  - auth expired
  - sync error
  - offline
- The account card owns the user actions for:
  - enable sync
  - sync now / retry
  - resume sync
  - re-authenticate
  - turn sync off on this device

## Runtime Integration
- `useSyncStore` is the device-level sync domain for:
  - `syncEnabled`
  - `firstSyncState`
  - `queuedOperations`
  - `queueStatus`
  - `lastSyncedAt`
  - `syncError`
  - `authExpired`
- `useSyncController` connects:
  - the account state
  - the workout/session libraries
  - Supabase sync reads/writes
  - online/offline listeners
  - background queue flushing
- `useWorkoutStore` now:
  - enqueues sync work for synced mutations
  - tombstones synced deletes
  - replaces local libraries from cloud snapshots
  - acknowledges synced records
  - purges tombstoned records after remote acknowledgement

## Test Coverage
- Sync metadata serialization remains covered in `sync.test.ts`.
- Sync domain behavior now covers queue dedupe and queue clearing when sync is turned off.
- Workout store coverage now includes tombstoned delete behavior for synced workouts.
- App/sidebar coverage continues to verify the account surface while the sync controller keeps the queue and sync card state aligned.
