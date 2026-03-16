# AGENTS.md

## 0) Agent Quick Start (Read This First)
- App type: single-page React timer for Myo-rep workouts.
- Core correctness lives in [`src/store/useWorkoutStore.ts`](src/store/useWorkoutStore.ts) (state machine) and [`src/App.tsx`](src/App.tsx) (worker loop + audio triggers).
- High-precision ticking is in [`src/utils/timerWorker.ts`](src/utils/timerWorker.ts) via Web Worker.
- Audio behavior is in [`src/utils/audioEngine.ts`](src/utils/audioEngine.ts) and depends on browser user-gesture unlock.
- If behavior changes touch timing/phase logic, update tests in `src/__tests__/`.

## 1) Project Overview
- Purpose: orchestrate Myo-rep workout timing (prep, activation set, rest, myo reps) with strong timing stability.
- Architecture: React UI + Zustand persistent store + Worker-driven elapsed-time ticks + Web Audio / Speech Synthesis + optional Picture-in-Picture canvas stream.
- Current source-of-truth version is in `package.json` (`3.1.0`); README may lag.

## 2) Full Tech Stack
- Runtime:
  - React 19 (`react`, `react-dom`)
  - TypeScript (strict mode)
  - Zustand + `persist` middleware
  - Web Worker (`?worker&inline` via Vite)
  - Web APIs: `AudioContext`, `speechSynthesis`, Picture-in-Picture
- UI:
  - Tailwind CSS v4 (`@import "tailwindcss"` in `src/index.css`)
  - Radix UI primitives (`label`, `switch`, `slot`)
  - shadcn-style local UI primitives in `src/components/ui/*`
  - `lucide-react` icons
  - `class-variance-authority`, `clsx`, `tailwind-merge`
- Tooling:
  - Vite aliased to `rolldown-vite` (`"vite": "npm:rolldown-vite@7.1.14"`)
  - `@vitejs/plugin-react` + `babel-plugin-react-compiler`
  - `vite-plugin-javascript-obfuscator` in production builds
  - ESLint 9 (flat config)
  - Vitest + Testing Library + jsdom
- Path alias:
  - `@/*` -> `./src/*` (configured in TS + Vite + Vitest)

## 3) Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview production build: `npm run preview`
- Lint: `npm run lint`
- Tests (watch): `npm run test`
- Tests (UI): `npm run test:ui`
- Coverage: `npm run test:coverage`
- CI-style one-shot tests: `npm run test -- --run`

## 4) Directory Structure
- `src/main.tsx`: app entry + root mount.
- `src/App.tsx`: main screen flow, worker lifecycle, tick-to-state synchronization, audio triggers, PiP canvas rendering.
- `src/store/useWorkoutStore.ts`: workout state machine + persistent user settings/config.
- `src/utils/timerWorker.ts`: worker interval loop emitting elapsed ms.
- `src/utils/audioEngine.ts`: metronome synthesis + TTS voice selection/speaking.
- `src/components/`: feature components (`Sidebar`, `SettingsPanel`, `ConcentricTimer`).
- `src/components/ui/`: reusable UI primitives.
- `src/lib/utils.ts`: `cn(...)` class merge helper.
- `src/__tests__/`: store and worker tests.
- `src/test/setup.ts`: test environment/global mocks.
- `public/`: static assets.
- `dist/`: build output (generated).

## 5) Coding Conventions
- Language/style:
  - TypeScript + React function components.
  - Keep existing style per file (some files use semicolons/4-space, shadcn files use 2-space/no semicolon).
  - Prefer `@/` alias imports instead of deep relative paths.
- State/data conventions:
  - Workout form values (`sets`, `reps`, `seconds`, `rest`, `myoReps`, `myoWorkSecs`) are stored as strings in Zustand.
  - Parse to numbers at action boundaries (`startWorkout`, `advanceCycle`) and validate `> 0`.
  - `timeLeft`/elapsed values are numeric seconds (can be fractional).
- UI conventions:
  - Theme class is attached at app root (`theme-default`, `theme-ocean`, `theme-fire`, `theme-forest`).
  - Shared utility classes should use `cn(...)`.

## 6) Rules (Important Invariants)
- Do not break timing model:
  - Worker posts elapsed time since `start`.
  - `App.tsx` computes `nextTimeLeft` from baselines (`baseTimeLeft`, `baseSetElapsedTime`) to avoid drift.
- Do not bypass state machine:
  - Phase transitions must stay centralized in `advanceCycle()`.
  - If adding a phase/status, update store types, `advanceCycle`, UI labels, and tests together.
- Keep audio robust:
  - `audioEngine.init()` must be called from user actions before relying on playback/speech.
  - TTS queue is intentionally flushed (`speechSynthesis.cancel()`) before speaking new values.
- Preserve production obfuscation safety:
  - If editing `vite.config.js` obfuscator options, keep reserved browser API names unless intentionally changed.
- Persistence scope is intentional:
  - Only settings, config fields, and theme persist.
  - Runtime timer/session state is not persisted across refresh.

## 7) Workflows
### A) Workout lifecycle (expected)
1. `Ready` (setup screen)
2. `startWorkout()` validates all numeric inputs > 0
3. `Preparing` for `settings.prepTime`
4. `Main Set` (activation reps)
5. `Resting` (if more sets remain)
6. `Myo Reps` on subsequent set(s)
7. Alternate `Resting` <-> `Myo Reps` until final set completes
8. `Finished`

Note: current logic does activation phase once at the start, then myo-rep phases on subsequent sets.

### B) Tick/update loop
1. UI starts worker with interval `50ms` (`smoothAnimation=true`) or `250ms`.
2. Worker emits `{ action: 'tick', elapsed }`.
3. App translates elapsed to `timeLeft` + `setElapsedTime` via baselines.
4. When `timeLeft <= 0.001`, app stops worker and calls `advanceCycle()`.

### C) Safe change workflow for agents
1. Change logic in store/worker/app.
2. Update tests in `src/__tests__/useWorkoutStore.test.ts` and/or `src/__tests__/timerWorker.test.ts`.
3. Run `npm run test -- --run` and `npm run build` before handoff.
4. If touching lint-sensitive files, run `npm run lint`.

## 8) Known Caveats
- ESLint config currently targets `**/*.{js,jsx}` only; TS/TSX lint coverage is limited.
- `npm run lint` currently fails on `__dirname` in `vite.config.js` and `vitest.config.js` (`no-undef`) unless lint config is adjusted for Node/ESM globals.
- `components.json` references `tailwind.config.js`, but this project runs Tailwind v4 from `src/index.css` and may not require that config file.
- `test_output.txt` appears to be an artifact, not source-of-truth behavior documentation.
