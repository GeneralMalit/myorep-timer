# MyoRep Capacitor Workboard

Goal: make this repo ready for a clean Capacitor port to iOS and Android without rewriting the workout engine.

## Lane 1: Mobile Shell and Layout
- [ ] Remove Picture-in-Picture from the app entirely. Delete the hidden canvas/video plumbing in `src/App.tsx` and the `Floating PIP` toggle in `src/components/SettingsPanel.tsx`.
- [ ] Replace the fixed desktop sidebar layout in `src/App.tsx` and `src/components/Sidebar.tsx` with a mobile-safe navigation pattern.
- [ ] Add a mobile breakpoint so the app does not rely on `ml-64` / `ml-16` side margins on phones.
- [ ] Make the main timer responsive in `src/components/ConcentricTimer.tsx`. It still hardcodes a `450px` SVG and oversized typography.
- [ ] Add a touch-friendly fallback for session reordering in `src/components/SessionCanvas.tsx`. The current drag-and-drop flow is desktop-first.
- [ ] Increase mobile touch targets in the sidebar and settings panels. Several controls are `h-6` / `h-7`, which is too small for comfortable touch use.
- [ ] Add safe-area handling for notched devices and verify the root layout on small screens.
- [ ] Check that all modal sheets and editors fit within the viewport without forcing horizontal scroll.

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
- [ ] Replace `window.prompt`, `window.alert`, and `window.confirm` in `src/App.tsx` with in-app dialogs.
- [ ] Replace the same browser dialogs in `src/components/SessionBuilder.tsx`.
- [ ] Replace the same browser dialogs in `src/components/SessionNodeEditor.tsx`.
- [ ] Replace the same browser dialogs in any other session/workout editing surface before porting.
- [ ] Make sure session rename, duplicate, delete, and save actions all work without relying on browser-native dialogs.

## Lane 5: Audio and Lifecycle
- [ ] Keep metronome audio as the primary mobile audio path.
- [ ] Validate `AudioContext` unlock and `speechSynthesis` behavior on iOS early in the port.
- [ ] Add explicit app lifecycle handling in `src/App.tsx` for background, resume, and screen-lock behavior.
- [ ] Decide whether TTS should stay web-based or move to a native Capacitor plugin later.
- [ ] Verify whether the 50ms smooth-ticking mode is worth keeping on mobile or should be reduced for battery life.

## Lane 6: Build and Store Readiness
- [ ] Add Capacitor dependencies and project configuration.
- [ ] Add build scripts for `cap init`, `cap sync`, `cap open ios`, and `cap open android`.
- [ ] Verify Vite output works as a static bundled app in a WebView.
- [ ] Decide whether production obfuscation in `vite.config.js` should be relaxed for mobile debugging.
- [ ] Update `index.html` for mobile app shell details, including `viewport-fit=cover` and a proper app favicon/icon.
- [ ] Replace the placeholder favicon in `index.html` with app branding.
- [ ] Add or verify app icons and splash assets before store packaging.

## Lane 7: Validation
- [ ] Run the full test suite after the port-readiness changes.
- [ ] Validate the worker timer on a real iPhone and Android device, not only in desktop browsers.
- [ ] Verify that workouts resume correctly after app backgrounding or app switch.
- [ ] Verify save, load, export, import, and delete flows on mobile touch input.
- [ ] Verify that audio and spoken countdowns still behave acceptably on iOS Safari/WebView.

## Suggested Parallel Ownership
- [ ] Agent A: Lane 1 and Lane 6.
- [ ] Agent B: Lane 2 and Lane 3.
- [ ] Agent C: Lane 4 and Lane 5.
- [ ] Agent D: Validation and device testing.
