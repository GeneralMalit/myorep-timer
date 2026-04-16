# MyoRep Capacitor Workboard

> Phase 0 lock: separate dev/prod Supabase projects, email magic links only, guest/free local-only, and a paid Plus subscription is required for cloud sync and session builder.

Goal: make this repo ready for a clean Capacitor port to iOS and Android without rewriting the workout engine.

## Subscription Decision Gate
- [x] Before Phase 6 implementation, the developer and Codex should flesh out the actual Plus subscription shape together:
  - [x] feasibility on Vercel web
  - [x] feasibility on Android app
  - [x] feasibility on iOS app
  - [x] Supabase entitlement/account integration
  - [x] exact locked vs free features
- Phase 6 now uses Paddle for web-based subscription billing, while Supabase entitlements stay the client-visible source of truth. Native App Store / Play billing remains deferred.
- Phase 7 now uses a private test-only Plus override path for validation. Live Paddle validation stays deferred, and there is still no general admin dashboard.

## Design Gate
- [x] Before changing mobile layout, navigation, dialogs, session editing, or other phone-first flows in code, create mockups and review them with the user.
- [x] Use the repo-local `docs/mobile-mockups.html` artifact as the concrete visual review surface for Phase 3.5.
- [x] Iterate the mockups with the user until they explicitly approve the direction, then implement the approved design.

## Lane 1: Mobile Shell and Layout
- [x] Create and review mobile mockups for the setup screen, timer screen, sidebar/navigation, and settings before changing these surfaces in code.
- [x] Remove Picture-in-Picture from the app entirely. Delete the hidden canvas/video plumbing in `src/App.tsx` and the `Floating PIP` toggle in `src/components/SettingsPanel.tsx`.
- [x] Replace the fixed desktop sidebar layout in `src/App.tsx` and `src/components/Sidebar.tsx` with a mobile-safe navigation pattern.
- [x] Add a mobile breakpoint so the app does not rely on `ml-64` / `ml-16` side margins on phones.
- [x] Make the main timer responsive in `src/components/ConcentricTimer.tsx`.
- [x] Add a touch-friendly fallback for session reordering in `src/components/SessionCanvas.tsx`. The current drag-and-drop flow is desktop-first.
- [x] Increase mobile touch targets in the sidebar and settings panels. Several controls were too small for comfortable touch use.
- [x] Add safe-area handling for notched devices and verify the root layout on small screens in the shared browser/simulator app shell.
- [x] Check that all modal sheets and editors fit within the viewport without forcing horizontal scroll.

## Lane 2: Data, Persistence, and Migration
- [ ] Keep the workout state machine intact, but decide whether Zustand `persist` should stay on browser storage or move to Capacitor storage/preferences.
- [ ] Add a migration plan for persisted data so existing `savedWorkouts`, `savedSessions`, `theme`, and config values survive a storage backend change.
- [ ] Verify that `editingSessionDraft` should really be persisted. If not, remove it from persistence and treat it as runtime-only draft state.
- [ ] Review `src/utils/savedWorkouts.ts` and `src/utils/savedSessions.ts` for schema versioning and future migration hooks.
- [ ] Decide whether session export/import should be exposed in the UI. The helper code exists in `src/utils/savedSessions.ts`, but the app currently only wires workout export/import.
- [ ] Define a mobile-safe backup story for user data: local only, share/export, or cloud sync later.

## Lane 3: Export, Import, and File Flow
- [ ] Replace the workout export download anchor in `src/App.tsx` with a mobile-friendly share/save flow.
- [ ] Replace the workout import file picker in `src/components/Sidebar.tsx` with a Capacitor-compatible document picker or share/import flow.
- [ ] Decide whether exported JSON should cover workouts only or both workouts and sessions.
- [ ] Make import error handling explicit in the UI rather than relying on browser file behavior.
- [ ] Confirm that exported filenames and JSON schemas are versioned and stable enough for long-term mobile use.

## Lane 4: Dialogs and Session Editing
- [x] Create and review mobile mockups for session editing, session builder flows, and in-app dialog patterns before replacing the browser-native versions.
- [x] Replace `window.prompt`, `window.alert`, and `window.confirm` in `src/App.tsx` with in-app dialogs.
- [x] Replace the same browser dialogs in `src/components/SessionBuilder.tsx`.
- [x] Replace the same browser dialogs in `src/components/SessionNodeEditor.tsx`.
- [x] Replace the same browser dialogs in any other session/workout editing surface before porting.
- [x] Make sure session rename, duplicate, delete, and save actions all work without relying on browser-native dialogs.

## Lane 5: Billing and Entitlements
- [x] Keep the billing model minimal for v1: `free` or `plus`, active or inactive.
- [x] Keep Supabase `entitlements` as the client-facing source of truth.
- [x] Plan Paddle checkout and customer-portal flows inside this repo.
- [x] Add the backend and webhook plumbing needed to translate Paddle state into Supabase entitlements.
- [x] Add upgrade/manage entry points that open a web-based purchase/manage flow.
- [x] Keep Plus gating explicit for cloud sync and session builder surfaces.
- [ ] Validate Paddle checkout, portal, and entitlement refresh against live Paddle/Supabase environments after production env vars are available.
  - Current execution decision: defer this live operator pass for now and move ahead with Phase 7 cross-platform validation work first, using the private Plus override path for test-only validation.
  - This remaining item is mostly operator/integration work, not another product-code phase.
  - Intended owner by default: the developer running Paddle, Supabase, and deployment setup.
  - Codex can still help prepare env files, walk the validation steps, inspect webhook logs, and troubleshoot failures once those external systems are available.
  - Minimum live-validation checklist:
    - create the real Paddle Plus product/price and capture the `price_id`
    - set `APP_URL`, `PADDLE_API_KEY`, `PADDLE_NOTIFICATION_SECRET_KEY`, `PADDLE_PLUS_PRICE_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_PADDLE_CLIENT_TOKEN`, and `VITE_PADDLE_ENV`
    - apply `supabase/migrations/0002_phase6_billing_foundation.sql` and `supabase/migrations/0003_phase6_paddle_billing.sql` in the target Supabase project
    - deploy or run the repo-hosted backend surface so `/api/paddle/checkout`, `/api/paddle/portal`, and `/api/paddle/webhook` are reachable
    - register the webhook endpoint in Paddle and subscribe at minimum to the subscription lifecycle events used by the repo
    - complete a Paddle sandbox purchase while signed into a real Supabase user
    - confirm `public.billing_accounts` is written and `public.entitlements` becomes active Plus
    - confirm the app returns through `?billing=success`, refreshes entitlement state, and unlocks cloud sync and session builder
    - confirm cancel and customer-portal flows leave the app in a coherent state
    - cancel or deactivate the subscription in Paddle and confirm entitlement falls back to free behavior
  - Acceptance notes for the later operator run:
    - the client should only ever resolve to `signed-in-free` or `signed-in-plus`
    - missing or inactive entitlements must relock both cloud sync and session builder
    - web checkout is the intended flow even for native shells in this phase

## Lane 6: Audio and Lifecycle
- [ ] Keep metronome audio as the primary mobile audio path.
- [ ] Validate `AudioContext` unlock and `speechSynthesis` behavior on iOS early in the native-shell/device validation phase.
- [x] Add explicit app lifecycle handling in `src/App.tsx` for background, resume, and screen-lock behavior.
- [ ] Decide whether TTS should stay web-based or move to a native Capacitor plugin later.
- [ ] Verify whether the 50ms smooth-ticking mode is worth keeping on mobile or should be reduced for battery life.

## Lane 7: Build and Store Readiness
- [x] Add Capacitor dependencies and project configuration.
- [x] Add build scripts for `cap init`, `cap sync`, `cap open ios`, and `cap open android`.
- [ ] Verify Vite output works as a static bundled app in a WebView.
- Windows-side Android shell verification now passes through `npx cap sync android` and `android\gradlew.bat assembleDebug`; runtime launch validation is still deferred to the later device/emulator session.
- [ ] Decide whether production obfuscation in `vite.config.js` should be relaxed for mobile debugging.
- [x] Update `index.html` for mobile app shell details, including `viewport-fit=cover` and a proper app favicon/icon.
- [x] Replace the placeholder favicon in `index.html` with app branding.
- [ ] Add or verify app icons and splash assets before store packaging. Current generated assets are acceptable for dev/internal native builds.
- [x] Wire Android to accept the custom-scheme auth callback `com.generalmalit.myoreptimer://auth/callback`.
- [ ] Generate the real iOS Xcode shell on macOS, then mirror the same callback wiring there. The current `ios/` directory is scaffold/plugin output only, not a buildable Xcode project.
- [ ] Before real paid onboarding or public launch, ship the minimum public website/legal surfaces:
  - [ ] Pricing page
  - [ ] Terms of Service page
  - [ ] Privacy Policy page
  - [ ] Refund Policy page
- [ ] Before launch, decide whether to stay on `https://myorep-timer.vercel.app/` or move paid onboarding to a custom production domain.

## Lane 8: Validation
- [x] Run the full test suite after the port-readiness changes.
- [ ] Validate the worker timer on a real iPhone and Android device, not only in desktop browsers. Save this for the later dedicated cross-platform validation session.
- [x] Verify in shared-app tests/browser simulation that workouts pause safely after app backgrounding or app switch.
- [x] Verify save, load, export, import, and delete flows on mobile touch input in the shared browser/simulator app.
- [x] Verify in shared-app tests that native Supabase auth callbacks work for both warm app-open events and cold-start launch URLs.
- [ ] Verify that audio and spoken countdowns still behave acceptably on iOS Safari/WebView. Save this for the later dedicated cross-platform validation session.
- [x] Confirm Android debug shell builds locally with `android\gradlew.bat assembleDebug`.
- [ ] Run full `cap sync` again after the iOS shell exists; current sync stops at the missing iOS Podfile/Xcode project.

## Suggested Parallel Ownership
- [x] Agent A: Lane 1 and Lane 7.
- [ ] Agent B: Lane 2 and Lane 3.
- [ ] Agent C: Lane 4 and Lane 5.
- [ ] Agent D: Lane 6 and Lane 8 in the later Android/iOS validation session.
