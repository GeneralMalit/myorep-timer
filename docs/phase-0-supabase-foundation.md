# Phase 0 Supabase Foundation

## Locked Decisions
- One shared React app remains the source of truth for web, iOS, and Android.
- Supabase is the first backend for auth and saved-data persistence.
- Separate dev and prod Supabase projects are required.
- Email magic links are the only v1 auth method.
- Guest and free users stay local-only.
- Signed-in free users get an account but no cloud sync entitlement.
- Session builder is a Plus-only feature.
- Plus users unlock cloud sync and session builder through an active paid subscription.
- Billing implementation is deferred, but the product direction is a real subscription-backed Plus tier rather than a manual entitlement forever.

## Environment Contract
- `VITE_ENABLE_SUPABASE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_REDIRECT_URL`
- `VITE_APP_ENV`

## Runtime Flagging
- Supabase stays completely off unless `VITE_ENABLE_SUPABASE=true`.
- Missing credentials should only matter after the feature flag is enabled.
- This keeps the current deployed app local-first while the backend work is built and tested separately.

## Local Model
- Runtime timer state stays in the existing workout store and is not persisted as account data.
- Account state lives beside the workout store in a dedicated account store.
- Sync metadata is attached to saved workouts and sessions so future cloud sync can track local ids, remote ids, revisions, dirty state, and tombstones.

## Supabase Schema
- `profiles`
- `entitlements`
- `saved_workouts`
- `saved_sessions`

## Next Steps
- Create the dev and prod Supabase projects.
- Apply the migration in `supabase/migrations/0001_phase0_foundation.sql`.
- Add the environment values for each deployment target.
- Keep the current local import/export flow as backup and migration tooling.
