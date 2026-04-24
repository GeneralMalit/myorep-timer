# Phase 2 Account Foundation

## Scope
- Phase 2 adds a lightweight account domain without changing the local-first workout engine.
- The app continues to work fully as a guest when Supabase is disabled, unconfigured, or unavailable.
- Authentication now supports username-based account creation plus email/password sign-in for normal access, requires a signup confirmation magic link before the first password login, and still defers the real paid Plus subscription flow to a later billing phase.

## Account Domain
- `useAccountStore` is the single client-side account domain for:
  - `bootstrapStatus`
  - `mode`
  - `session`
  - `profile`
  - `entitlement`
  - `syncStatus`
  - `error`
- Account bootstrap is driven by `SupabaseBootstrap` and `useSupabaseBootstrap`.
- The bootstrap flow:
  - inspects the Supabase runtime environment
  - reads the current auth session when Supabase is enabled and configured
  - fetches `profiles` and `entitlements` for signed-in users
  - reacts to auth state changes and refetches account data after session updates

## Guest, Free, and Plus Behavior
- Guests keep using one shared on-device library for workouts and sessions.
- Signed-in free users have:
  - account identity
  - profile data
  - entitlement state
  - no cloud sync access
  - no session builder access
- Signed-in Plus users have the same account identity plus `cloudSyncEnabled = true` and access to session builder.
- Missing entitlement rows default to:
  - `plan = free`
  - `cloudSyncEnabled = false`
  - normal signed-in-free behavior instead of an error state
- Logout does not repartition, clear, or migrate the shared local library in Phase 2.

## UI Surface
- The primary auth entry lives in the existing sidebar as a compact account card.
- The account card shows:
  - guest: username + email + password account creation, signup confirmation resend, password sign-in after confirmation, and forgot-password
  - signed-in free: username/account identity, Free badge, username editing, Plus upsell, and locked messaging for cloud sync/session builder
  - signed-in Plus: username/account identity, Plus badge, username editing, and available messaging for cloud sync/session builder
  - bootstrapping/error/disabled states with concise status copy
  - password recovery: reset-password form when Supabase returns a recovery link/session
- `App.tsx` owns the auth action handlers and passes callbacks into `Sidebar.tsx`.
- `SupabaseStatusPill` remains a low-level environment/status indicator separate from the account card.

## Backend Contract
- `profiles` is the source for account identity metadata, including the canonical unique `username`.
- `entitlements` is the source of truth for plan state when a row exists.
- Phase 2 supports exactly two client-visible plans:
  - `free`
  - `plus`
- The actual paid subscription purchase flow is still out of scope here; Phase 2 only exposes whether the account should be treated as free or Plus.

## Failure Handling
- Supabase disabled or unconfigured keeps the account flow inert and preserves local-first behavior.
- Missing client configuration marks account bootstrap as unavailable instead of crashing the app.
- Profile or entitlement fetch failures surface as account errors without deleting local workouts or sessions.

## Test Coverage
- Bootstrap covers:
  - disabled and unconfigured environments
  - signed-in free resolution
  - missing entitlement fallback to free
  - fetch failure handling
- Sidebar and app coverage covers:
  - guest password sign-in and sign-up entry with confirmation-link messaging
  - forgot-password and password recovery handling
  - email validation
  - signed-in free and Plus account visibility
  - error messaging
  - sign-out while keeping the shared local library intact
