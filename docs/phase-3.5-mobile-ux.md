# Phase 3.5 Mobile UX Design and Approval

## Scope
- Phase 3.5 is a design-lock phase for the shared mobile UX.
- This phase does not implement the mobile redesign in code.
- The output of this phase is an approved mobile navigation model, approved key screens, and implementation notes that Phase 4 can follow without reopening major UX decisions.

## Locked Direction
- `docs/mobile-mockups.html` is the primary design and approval surface for Phase 3.5.
- `Figma` and `Stitch` are optional follow-on tools, not required sources of truth for this phase.
- The mobile IA uses a focused-stack model:
  - one primary screen at a time
  - contextual drawers, sheets, and dialogs instead of persistent tab chrome
  - no desktop-style always-visible sidebar on phone screens
- Phase 3.5 stops at approved key screens plus implementation notes. It does not expand into a full prototype or design-system rewrite.

## Current-State Inventory
- The app is state-driven from `src/App.tsx`, not route-driven.
- The current desktop-oriented surfaces that need explicit mobile redesign before Phase 4 are:
  - workout setup
  - timer/runtime screen
  - sidebar/navigation
  - settings
  - saved workouts and saved sessions flows
  - session builder
  - session node editor
  - account, plan, and sync surfaces added in Phases 2 and 3

## Current Mobile Risks
- `src/App.tsx` still uses `window.prompt`, `window.alert`, and `window.confirm` for save, rename, duplicate, create, and delete flows. Mobile designs must replace these with in-app dialogs or sheets.
- `src/components/Sidebar.tsx` still behaves like a dense control panel and library browser. Mobile should not rely on the current desktop mental model of “everything lives in the sidebar.”
- `src/components/SessionBuilder.tsx` and `src/components/SessionCanvas.tsx` are the highest-risk mobile surfaces because the current flow is horizontally structured and drag/drop-first.
- `src/components/SessionNodeEditor.tsx` assumes a desktop overlay geometry that is likely too wide and too offset for small screens.
- `src/components/SettingsPanel.tsx` already behaves like a sheet, but the density and grouping still need mobile-specific tuning.
- `src/components/ConcentricTimer.tsx` is more mobile-capable than the session-builder flow, but the surrounding composition in `src/App.tsx` still needs a cleaner phone-first layout.

## Mobile IA
- Top-level user journeys:
  - configure a workout
  - run a timer
  - browse and load saved workouts or sessions
  - build and edit a session
  - adjust settings
  - inspect account and sync state
- Mobile navigation model:
  - a compact mobile header appears on top-level screens
  - the main screen owns the primary action for the current task
  - library/navigation content is reached through a drawer or dedicated mobile surface, not a permanent sidebar
  - settings and node editing use mobile-friendly sheets or full-screen overlays depending on complexity
- Explicit non-goal:
  - do not introduce bottom tabs as the default Phase 3.5 direction

## Required Key Screens
- Navigation shell:
  - mobile header
  - drawer or equivalent mobile library/navigation entry
- Workout setup screen
- Timer/runtime screen
- Saved workouts and saved sessions flow
- Session builder main screen
- Session node editing flow
- Settings flow
- Account and sync states for:
  - guest
  - signed-in free
  - signed-in Plus
  - syncing
  - sync error or offline

## Screen-Level Decisions To Lock
- Which actions remain visible in the mobile header versus move into overflow or drawer.
- Whether saved workouts and saved sessions live together in one mobile library surface or as separate sections inside the same flow.
- How session reordering works on touch without making desktop drag-and-drop the only primary interaction.
- Which interactions use:
  - full screen
  - bottom sheet
  - centered dialog
- How destructive actions, rename actions, and save-as flows work without browser-native dialogs.
- How safe-area padding behaves across header, drawer, footer, and full-screen overlays.

## Local Mockup Deliverables
- One reviewable local mobile screen set in `docs/mobile-mockups.html` that covers all required key screens.
- One compact flow map showing how users move between:
  - setup
  - timer
  - library
  - session builder
  - settings
  - account and sync surfaces
- One short handoff note per screen covering:
  - primary action
  - navigation entry and exit
  - surface type
  - special mobile interaction notes

## Approval Criteria
- The user has reviewed the local mobile mockups in `docs/mobile-mockups.html`.
- The user explicitly approves the mobile direction before Phase 4 shared-app refactors begin.
- The approved direction is specific enough that Phase 4 does not need to invent:
  - navigation structure
  - dialog patterns
  - session editing interaction model
  - account and sync placement

## Phase 4 Handoff Notes
- Phase 4 should implement the approved mobile direction only.
- If implementation exposes a major UX conflict, the work should loop back into design review instead of improvising a new pattern in code.
- Phase 4 should prioritize these implementation areas in order:
  - navigation shell and library access
  - browser-dialog replacement
  - session builder and node editing
  - settings/account/sync integration
  - timer-screen layout polish
