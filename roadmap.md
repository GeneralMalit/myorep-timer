# MyoRep Timer Mobile Roadmap

## Execution Rule
- [ ] If a roadmap item requires work that only the user can do in an external tool or account, prompt for it immediately instead of deferring it to a later phase.
- [ ] Keep user-owned setup tasks visible in the roadmap as explicit checklist items.
- [ ] Before any mobile-first UI redesign work begins, create mockups for the affected flows and iterate with the user until they explicitly approve the design direction.
- [ ] Use a hands-on design review loop for mobile UI changes. Preferred tools are Figma and/or Stitch when the work benefits from interactive mockups.

## Goal
- [ ] Ship MyoRep Timer as one shared product with three targets: web, iOS, and Android.
- [ ] Keep the shared React app as the source of truth while using Capacitor as the mobile delivery shell.
- [ ] Deliver mobile v1 with parity to the current web experience, then layer in accounts, sync, and monetization without splitting the codebase into separate platform products.

## Product Principles
- [ ] Shared React code stays primary; native wrappers stay thin.
- [ ] Fix shared behavior in `src/` before introducing native-only divergence.
- [ ] Ship iOS and Android together.
- [ ] Treat login as a requirement for cloud sync, not for basic timer use.
- [ ] Keep free users local-first and treat Plus as a paid subscription tier.
- [ ] Gate cloud sync and session builder behind an active Plus subscription.
- [ ] Preserve import/export as backup and migration tooling even after cloud sync exists.

## Phase 0: Product and Architecture Lock
> Decision lock is now captured in `docs/phase-0-supabase-foundation.md` and the Supabase migration files. Completed Phase 0 items are checked off below.
### Outcomes
- [x] Confirm the platform strategy: one shared React app, one `main` branch, three targets.
- [x] Confirm Supabase as the first backend for auth and saved-data persistence.
- [x] Freeze the first monetization shape:
  - [x] guest/free users can run timers and keep local saved data
  - [x] signed-in free users have an account but no cloud sync entitlement
  - [x] Plus users unlock cloud sync and session builder through an active subscription
- [x] Lock non-goals for v1:
  - [x] no native rewrite
  - [x] no social login in v1
  - [x] no multi-user/team accounts
  - [x] no advanced billing/promo system beyond plan status and entitlement checks

### Work Lanes
- [x] `Shared App`: confirm the current web workflow that must remain intact during the mobile/account rollout.
- [x] `Shared App`: identify the persistent state that should remain local-only versus what should become sync-aware.
- [x] `Auth / Accounts`: define the account lifecycle: guest, signed-in free, signed-in Plus.
- [x] `Auth / Accounts`: define the ownership model for user identity and plan status.
- [x] `Release Ops`: confirm that `main` remains the source of truth for web and future mobile releases.
- [x] `Release Ops`: keep semantic-release-compatible commit discipline for deployable changes.
- [x] Supabase integration stays runtime-optional through `VITE_ENABLE_SUPABASE`, so deployed builds remain local-first until the flag is explicitly enabled.

### Gate
- [x] Product, monetization, and platform boundaries are documented and no core v1 product decisions remain open.

### User Setup Needed
- [x] Use the Supabase naming scheme:
  - [x] `myorep-timer-dev`
  - [x] `myorep-timer-prod`
- [x] Create the separate Supabase dev project.
- [x] Create the separate Supabase prod project.
- [x] Enable email magic links in both Supabase projects.
- [x] Set the redirect URLs for web and mobile entry points in both Supabase projects.
- [x] Send the Supabase project URL and anon key for each environment so the app can be pointed at dev and prod.
- [ ] Confirm the auth callback / deep-link scheme later, if you want anything beyond the default browser redirect path.

## Phase 1: Data Model and Persistence Redesign
> Persistence decisions are now captured in `docs/phase-1-persistence-model.md`, the saved entity types/utils, and the Zustand persist migration in `src/store/useWorkoutStore.ts`.
### Outcomes
- [x] Separate current Zustand state into three categories:
  - [x] runtime-only timer/session execution state
  - [x] local persistent preferences/config
  - [x] user library data (`savedWorkouts`, `savedSessions`) with sync metadata
- [x] Define a canonical data model for workouts and sessions that works across:
  - [x] local persistence
  - [x] Supabase storage
  - [x] import/export payloads
- [x] Add schema versioning and migration hooks for future compatibility.
- [x] Remove any assumption that browser-only persistence is the long-term source of truth for saved libraries.

### Work Lanes
- [x] `Shared App`: document the current persistent store boundaries in `src/store/useWorkoutStore.ts`.
- [x] `Shared App`: plan the refactor needed to isolate local preferences from syncable library data.
- [x] `Supabase / Data`: define the remote representation for workouts, sessions, account status, and sync metadata.
- [x] `Supabase / Data`: choose simple single-user conflict handling for v1: last-write-wins with timestamps/version fields.
- [x] `Sync / Persistence`: add sync metadata requirements to saved entities:
  - [x] local id
  - [x] remote id
  - [x] revision/update timestamp
  - [x] pending-sync/dirty state
  - [x] delete/tombstone strategy if needed
- [x] `Sync / Persistence`: define how guest-local data is upgraded into authenticated cloud-backed data.

### Gate
- [x] A single persistence model exists for local, remote, and import/export usage, and it is versionable and migration-safe.

## Phase 2: Account and Subscription Foundation
> Account-state decisions are now captured in `docs/phase-2-account-foundation.md`, the dedicated account store/bootstrap flow, and the sidebar account UI/tests.
### Outcomes
- [x] Introduce the app-level account domain:
  - [x] auth state
  - [x] user profile/account id
  - [x] entitlement/plan status
  - [x] sync status
- [x] Define login/logout UX for web and mobile using email magic links first.
- [x] Define save behavior by user state:
  - [x] guest/free: local persistence only
  - [x] signed-in free: account exists, but cloud sync stays locked
  - [x] signed-in Plus: cloud sync is active
- [x] Define logout/account-switch handling on the same device.
- [x] Keep billing/account status in Supabase even if the payment provider integration lands slightly later.

### Work Lanes
- [x] `Auth / Accounts`: design the auth session lifecycle, token refresh expectations, and account bootstrap flow.
- [x] `Auth / Accounts`: define guest-to-account upgrade UX and post-login entry behavior.
- [x] `Shared App`: plan the UI surfaces for login, logout, account status, plan status, and sync state without cluttering the timer workflow.
- [x] `Supabase / Data`: define how account records, plan status, and entitlements are represented and refreshed.
- [x] `Billing / Entitlements`: define the minimum entitlement shape needed in the client and backend for `free` and `plus`.

### Gate
- [x] Auth, account state, plan status, and local-vs-cloud save behavior are fully specified for web and mobile.

## Phase 3: Sync Engine and Migration
> Sync decisions are now captured in `docs/phase-3-sync-engine.md`, the dedicated sync store/controller, the Supabase sync helpers, and the sync-aware workout store mutations/tests.
### Outcomes
- [x] Design an offline-first sync queue for saved workouts and saved sessions.
- [x] Preserve the current local-first feel while making cloud sync resilient when connectivity returns.
- [x] Define migration and recovery paths for existing users and old data.
- [x] Keep import/export as backup and migration tooling.

### Work Lanes
- [x] `Sync / Persistence`: define the sync queue lifecycle: enqueue, retry, backoff, reconciliation, success/failure clearing.
- [x] `Sync / Persistence`: define offline behavior for create, update, delete, and merge scenarios.
- [x] `Supabase / Data`: define duplicate prevention, auth-expired handling, and partial-failure recovery rules.
- [x] `Shared App`: add UI states for:
  - [x] guest
  - [x] signed-in free
  - [x] signed-in Plus
  - [x] syncing
  - [x] sync error/offline
- [x] `Shared App`: plan clear user-facing status messaging without noisy interruptions.
- [x] `QA / Validation`: define migration scenarios for existing local users and account sign-in/upload flows.

### Gate
- [x] Sync, offline editing, migration, and failure recovery are concrete enough to implement without further product decisions.

## Session Node Notes
- [x] Workout session nodes now support optional notes for tracking previous weight or short reminders.
- [x] Notes are visible in the session builder canvas cards and editable in the node editor.
- [x] Notes persist through local save/load, import/export, and sync payloads.

## Phase 3.5: Mobile UX Design and Approval
### Outcomes
- [x] Define the mobile information architecture and key screen flows before Phase 4 shared-app redesign work starts.
- [x] Produce mobile mockups for the flows that will materially change on phone-sized screens.
- [x] Review those mockups with the user and keep iterating until the user is happy with the mobile design and interaction model.
- [x] Freeze the approved mobile UX direction before implementing major mobile layout/navigation/dialog redesigns in code.

### Work Lanes
- [x] `Design / UX`: identify which current desktop-oriented surfaces need mobile redesign before implementation:
  - [x] setup screen
  - [x] timer screen
  - [x] sidebar/navigation
  - [x] settings
  - [x] saved workouts and saved sessions flows
  - [x] session builder and node editing flows
  - [x] auth/account/save-state surfaces introduced by Phases 2 and 3
- [x] `Design / UX`: create mobile mockups in the repo-local `docs/mobile-mockups.html` review artifact before changing those flows in code.
- [x] `Design / UX`: walk through the mockups with the user, capture feedback, revise the review artifact, and repeat until the user explicitly approves the design.
- [x] `Design / UX`: document the approved mobile navigation, screen hierarchy, and interaction decisions so implementation work can follow them consistently.
- [x] `Shared App`: do not start major mobile layout or navigation refactors from Phase 4 until the user-approved mockups exist.

### Gate
- [x] User-reviewed mobile mockups exist for the major redesigned flows, and the user has explicitly approved the direction before Phase 4 implementation begins.

## Phase 4: Shared App Mobile Hardening
### Outcomes
- [x] Make the shared app safe to run inside browser-based mobile shells and mobile simulators after the persistence/account foundation is defined.
- [ ] Remove remaining browser-only blockers from critical flows.
- [ ] Keep timer/audio/session correctness intact while surfacing account and sync state clearly.

### Work Lanes
- [x] `Shared App`: implement only the mobile UI direction that was approved in Phase 3.5, and loop back to design review if implementation uncovers a major UX change.
- [x] `Shared App`: add pause/resume/background lifecycle handling.
- [x] `Shared App`: replace remaining browser-native dialogs with in-app flows.
- [x] `Shared App`: verify safe-area, keyboard, orientation, and narrow-screen behavior.
- [x] `Shared App`: validate login/account/save-state surfaces across setup, timer, sidebar, and session flows.
- [ ] `Audio / Lifecycle`: validate timer, metronome, and TTS behavior in native mobile webviews. Deferred to Phase 5/7 native validation because this pass stayed browser/simulator-only.
- [x] `Audio / Lifecycle`: confirm lifecycle transitions do not corrupt active workouts or session state.
- [x] `QA / Validation`: verify that persistence/auth changes do not regress timer execution or audio behavior.

### Gate
- [ ] The shared app has no major native-mobile-webview blockers, no critical browser-only UI dependencies, and no timer/audio regressions from the account changes. Shared-app browser/simulator hardening is complete; native-webview confirmation is deferred to Phase 5/7.

## Phase 5: Native Shell Setup
### Outcomes
- [ ] Set up the actual Capacitor wrappers as thin native delivery shells. Android execution is in-scope on Windows; iOS execution remains blocked on macOS/Xcode.
- [ ] Keep iOS and Android work focused on platform plumbing, not business logic duplication.
- Android-first Phase 5 passes on Windows should prove the shared bundle sync/build path and shared native auth bootstrap path, while treating iOS as a detailed handoff until Xcode is available.

### Work Lanes
- [ ] `iOS Wrapper`: generate/sync the real `ios/` project on the next macOS/Xcode pass.
- [ ] `iOS Wrapper`: configure app id, metadata, icons, splash assets, deep-link/auth return handling, and iOS lifecycle hooks after the Xcode project exists.
- [x] `Android Wrapper`: generate/sync the real `android/` project when execution begins.
- [ ] `Android Wrapper`: configure app id, metadata, icons, splash assets, deep-link/auth return handling, and Android lifecycle hooks.
  - [x] Wire the custom-scheme auth callback intent filter for `com.generalmalit.myoreptimer://auth/callback`.
  - [x] Keep `MainActivity` thin and keep the manifest/string resources aligned with the shared app id, app name, and callback scheme.
- [ ] `Shared App`: confirm the web bundle behaves correctly in the native WebView shell.
  - [x] Add native-aware redirect selection and Capacitor URL-open auth callback handling in the shared app.
- [x] `Auth / Accounts`: ensure magic-link and auth callback flows are compatible with web and native entry points.
  - [x] Web and Android now share the same Supabase bootstrap path, with native callback codes exchanged through the existing account bootstrap flow.
  - [x] Cold-start native auth callbacks now flow through the same shared bootstrap logic as warm app-open events.

### Gate
- [ ] Android shell sync/build and the shared app/native auth plumbing are in place; launch and real-device validation are intentionally deferred to the later cross-platform validation session on Android and iOS hardware/simulators.

## Phase 6: Billing and Entitlements
> Phase 6 is now Paddle-backed, web-upgrade-first, and intentionally keeps Supabase as the client-visible entitlement source of truth. Native App Store / Play billing stays deferred to later phases.
### Outcomes
- [x] Add the monetization delivery work explicitly instead of hiding it inside auth.
- [x] Make Plus subscription gating concrete and consistent across platforms.
- [x] Keep the billing lifecycle intentionally minimal for v1: `free` or `plus`, active or inactive, with no trial/grace-period model in the client.

### Work Lanes
- [ ] `Developer Decision`: flesh out the Plus subscription model with Codex before implementation:
  - [x] confirm feasibility across Vercel web, Android app, and iOS app
  - [x] define how subscription state integrates into Supabase entitlements and account state
  - [x] explicitly define which features are locked behind Plus and which remain free
- [x] `Billing / Entitlements`: decide the first real payment channel for Plus subscriptions across web, iOS, and Android.
  - [x] Paddle is the first billing provider
  - [x] checkout and management flows are web-based for v1
  - [x] native App Store / Play billing is deferred
- [x] `Billing / Entitlements`: define how entitlement changes propagate to Supabase and the client.
  - [x] repo-hosted Paddle endpoints now create checkout and customer-portal sessions for authenticated Supabase users
  - [x] Paddle webhooks project active/inactive subscription state into Supabase `entitlements`
  - [x] the client refreshes entitlement state after successful billing return
- [x] `Billing / Entitlements`: define how web and mobile purchases affect the same account state.
  - [x] all targets route through the same web checkout and portal flow
  - [x] the same Supabase account entitlement is read on web and mobile shells
- [x] `Shared App`: plan upgrade prompts and locked/unlocked states for both cloud sync and session builder.
- [x] `Shared App`: define graceful fallback behavior when Plus lapses.
  - [x] inactive entitlements resolve to free behavior
  - [x] cloud sync and session builder both relock when entitlement state is no longer active
- [x] `QA / Validation`: define entitlement transition test cases for upgrades, expired plans, and stale status refreshes.
  - [x] checkout and portal require authenticated users
  - [x] webhook idempotency is covered in tests
  - [x] billing-return entitlement refresh is covered in shared-app tests

### Gate
- [x] Plan status and feature gating are fully specified, and an active Plus subscription unlocks cloud sync and session builder consistently in the shared app and backend contract.
- [ ] Live Paddle and Supabase environments still need end-to-end validation before treating billing as release-ready.
  - Current execution decision: defer this live operator pass for now and continue product/mobile validation first; Phase 7 now uses a private test-only Plus override path for validation, and no admin dashboard exists yet.
  - This is primarily an operator/deployment task rather than an in-repo coding task.
  - Default owner: the developer who controls the Paddle account, Supabase project, env vars, and deployment target.
  - Codex should assist by:
    - preparing the exact env/config checklist
    - validating that the deployed behavior matches the intended contract
    - helping debug webhook delivery, auth mismatches, or stale entitlement reads if the live run fails
  - Required live checks:
    - the Plus Paddle product/price exists and `PADDLE_PLUS_PRICE_ID` matches it
    - the webhook endpoint is registered and receives subscription events successfully
    - a real signed-in user can complete checkout and return to the app
    - Supabase `billing_accounts` and `entitlements` reflect the Paddle result correctly
    - the app unlocks Plus surfaces after success and relocks them after deactivation
  - This gate is not intended to reopen the Phase 6 design:
    - billing provider remains Paddle
    - upgrade/manage stays web-based
    - `free` and `plus` remain the only client-visible plan states
    - native App Store / Play billing remains deferred

## Phase 7: Cross-Platform Validation
### Outcomes
- [ ] Validate the combined timer, account, sync, and entitlement system on real devices and real accounts.
- [ ] Use this as the dedicated Android/iOS hardware or simulator testing session once device access is available.
- [ ] Exercise Plus behavior through a private test-only override path while live Paddle remains deferred.
- [ ] Treat parity and persistence trustworthiness as release blockers.

### Work Lanes
- [ ] `QA / Validation`: test guest mode, signed-in free mode, and test-only Plus mode separately.
- [ ] `QA / Validation`: validate timer continuity, audio/TTS, save/load correctness, sync correctness, offline edits, reconciliation, logout/login, and account switching.
- [ ] `Ops / Accounts`: keep the Plus override path private and service-role-backed; no admin dashboard is in scope yet.
- [ ] `Shared App`: fix parity or workflow bugs uncovered in web/mobile shared logic.
- [ ] `iOS Wrapper`: resolve iOS-specific auth, lifecycle, or WebView behavior issues.
- [ ] `Android Wrapper`: resolve Android-specific auth, lifecycle, or WebView behavior issues.

### Gate
- [ ] Real-device validation passes for persistence, auth, entitlement, and workout execution across web, iOS, and Android, with Plus behavior verified through the private override path until live Paddle is ready.

## Phase 8: Beta Readiness
### Outcomes
- [ ] Prepare TestFlight and Android internal testing around real account flows and synced libraries.
- [ ] Publish the minimum public web surfaces needed for real subscription onboarding and tester trust.

### Work Lanes
- [ ] `Release Ops`: set up environment separation, signing, and tester distribution.
- [ ] `Release Ops`: prepare beta instructions for guest use, login, cloud sync, and Plus verification.
- [ ] `Web / Product`: ship a public-facing pricing page that matches the actual free vs Plus feature set.
- [ ] `Web / Product`: ship starter legal/support pages for:
  - [ ] Terms of Service
  - [ ] Privacy Policy
  - [ ] Refund Policy
- [ ] `QA / Validation`: enforce beta acceptance gates:
  - [ ] no destructive save/sync regressions
  - [ ] no app-breaking auth flows
  - [ ] no major timer/audio blockers
  - [ ] no account-state confusion in core flows

### Gate
- [ ] Internal testers can install the app, authenticate, sync data where entitled, and complete real workout/session flows without critical blockers.

## Phase 9: Store Readiness
### Outcomes
- [ ] Finish store-facing work only after auth, sync, and entitlement behavior is stable.
- [ ] Ensure the production domain and public product/legal pages are coherent with the actual billing flow before public launch.

### Work Lanes
- [ ] `Release Ops`: prepare App Store and Play Store metadata, privacy disclosures, descriptions, screenshots, and account/subscription documentation.
- [ ] `Release Ops`: decide whether launch continues on the `vercel.app` domain or moves to a custom production domain before real paid onboarding starts.
- [ ] `Web / Product`: review the pricing, Terms, Privacy, and Refund pages against the final shipped feature set and billing behavior.
- [ ] `Release Ops`: define release-day and rollback checklists.
- [ ] `QA / Validation`: run final regression in:
  - [ ] guest/local mode
  - [ ] signed-in free mode
  - [ ] Plus synced mode
- [ ] `Shared App`: confirm release builds still match the intended web/mobile product behavior.

### Gate
- [ ] Both stores are submission-ready with stable builds, complete assets/metadata, and passing final regression.

## Phase 10: Post-v1
- [ ] richer conflict resolution and merge tooling
- [ ] social login / Apple / Google sign-in
- [ ] better subscription management UX
- [ ] stronger backup/recovery flows
- [ ] optional native audio/TTS improvements
- [ ] future analytics/admin tooling if needed

## Phase 6 Billing Handoff
- See `docs/phase-6-billing-handoff.md` for the implementation-ready Paddle billing plan, backend surface, Supabase entitlement contract, and user-facing upgrade/manage flow.
- Use that handoff together with the operator checklist above when doing the real Paddle/Supabase validation pass later.

## Test and Acceptance Coverage
- [ ] guest user saves workouts/sessions locally and keeps them after app restart
- [ ] guest user signs in and migrates local library to account-backed cloud storage
- [ ] signed-in free user keeps local usage but does not receive cloud sync
- [ ] signed-in free user cannot access session builder
- [ ] Plus user sees shared workout/session persistence between web and mobile
- [ ] Plus user can access session builder while a non-Plus user cannot
- [ ] offline edits queue and reconcile correctly when connectivity returns
- [ ] logout does not silently destroy user data
- [ ] switching accounts on one device does not mix libraries
- [ ] entitlement changes correctly lock/unlock cloud sync and session builder behavior
- [ ] import/export still works as backup and migration tooling
- [ ] timer/audio/session execution remains correct after persistence/auth changes

## Suggested Parallel Ownership
- [ ] Agent A: `Shared App` + `Audio / Lifecycle`
- [ ] Agent B: `Auth / Accounts` + `Billing / Entitlements`
- [ ] Agent C: `Supabase / Data` + `Sync / Persistence`
- [ ] Agent D: `iOS Wrapper` + `Release Ops`
- [ ] Agent E: `Android Wrapper` + `QA / Validation`

## Notes for Implementation
- [ ] `workboard.md` remains a useful prep artifact, but this file is the primary mobile delivery roadmap.
- [ ] `ios/AGENTS.md` and `android/AGENTS.md` remain platform-specific planning companions, not duplicate roadmaps.
- [ ] The current local import/export utilities should be preserved and reframed as backup and migration tools, not the long-term primary persistence layer.
- [ ] The first major mobile UI redesign work starts in Phase 3.5 and Phase 4, not earlier. Those phases require user-reviewed mockups before implementation.
