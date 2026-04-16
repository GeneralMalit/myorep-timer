# Phase 3.5 Mobile Screen Prompt

> Legacy generation prompt. The approved Phase 3.5 source of truth now lives in `docs/mobile-mockups.html` and `docs/phase-3.5-mobile-ux.md`.

Design mobile screens for `MyoRep Timer`, a dark, kinetic, high-performance workout timer app used for Myo-rep training. Keep the existing visual identity: aggressive italic headlines, high-contrast dark surfaces, purple primary actions, lime accent for performance states, and a cockpit-like feel. Do not redesign the brand. Adapt it for mobile.

## Core Direction
- Use a focused-stack mobile IA.
- Show one primary screen at a time.
- Use contextual drawers, bottom sheets, and dialogs instead of a permanent desktop sidebar.
- Keep the main task dominant on each screen.
- Avoid bottom tabs for this phase.

## Required Screens
- Mobile navigation shell with top header and library/navigation entry.
- Workout setup screen.
- Timer/runtime screen.
- Saved workouts and saved sessions library flow.
- Session builder main screen.
- Session node editing flow.
- Settings flow.
- Account and sync state surfaces for guest, signed-in free, signed-in Plus, syncing, and sync error/offline.

## Product Constraints
- The app is one shared product for web, iOS, and Android.
- Workout correctness and timer behavior must not be visually obscured by excessive chrome.
- Sync is optional and should feel secondary to the timer workflow.
- Session builder must become touch-first, not drag/drop-first.
- Rename, delete, save-as, duplicate, and create flows must use in-app dialogs or sheets, not browser-native prompts.

## Priority Problems To Solve
- The current sidebar is too dense and desktop-oriented for mobile.
- The current session builder is horizontally structured and difficult for touch.
- The node editor is too desktop-modal in shape and placement.
- The timer screen still carries too much surrounding metadata on small screens.
- Settings and account/sync need cleaner grouping for one-handed mobile use.

## Visual Rules
- Keep the dark “kinetic cyber-athleticism” direction.
- Preserve bold italic Lexend-style headline energy.
- Preserve purple primary actions and lime performance accents.
- Use layered surfaces instead of busy borders.
- Keep strong contrast, but reduce density enough for comfortable phone use.
- Favor large tap targets and obvious action hierarchy.

## Screen Intent
- Workout setup should feel fast, editable, and focused on starting a session.
- Timer should feel immersive and operational, with countdown clarity first.
- Library should make load, save, duplicate, and manage actions obvious without becoming a cluttered admin panel.
- Session builder should feel compositional and touch-native, with clear add, edit, reorder, and start actions.
- Node editing should feel like a mobile-first editor, likely a sheet or full-screen flow depending on content depth.
- Settings and account/sync should feel supportive, not dominant.

## Deliverable Standard
- Produce a tight set of approval-ready mobile screens, not a full prototype.
- Each screen should be believable as a Phase 4 implementation target.
- The result should remove ambiguity around navigation, dialogs, session editing, and account/sync placement.
