# Project Context: Myo-Rep Engine

This document provides essential technical context for AI agents and developers working on the Myo-Rep Engine. It outlines the architectural decisions, core logic flows, and critical performance requirements of the system.

---

## 1. Project Philosophy
High-intensity training protocols like Myo-reps require sub-second precision. Common web development patterns (like `setInterval` in the main thread) are insufficient due to browser throttling and main-thread jitter. This project focuses on **deterministic timing** and **sensory synchronization** (TTS/Visuals).

---

## 2. Core Architecture

### 2.1. Timing Logic (Web Worker)
**File**: `src/utils/timerWorker.ts`
- **Purpose**: Prevents the browser from pausing the timer when the tab is in the background or the main thread is busy with React re-renders.
- **Mechanism**: Utilizes `performance.now()` for high-resolution timestamps. It emits a `tick` event via `postMessage` every 50ms (or 250ms depending on settings), containing the `elapsed` milliseconds since the timer started.
- **Critical Node**: The worker is initialized in `App.tsx` and maintains its own `startTime` to avoid drift.

### 2.2. State Management (Zustand + FSM)
**File**: `src/store/useWorkoutStore.ts`
- **Purpose**: Manages the Finite State Machine (FSM) governing the workout protocol.
- **States**: `Ready` -> `Preparing` -> `Main Set` -> `Resting` -> `Myo Reps` -> `Finished`.
- **Core Function**: `advanceCycle()` handles all phase transitions. It calculates whether to move to the next rep, start a rest period, or transition from Activation (Main Set) to Myo Sets.
- **Persistence**: Store state is persisted to `localStorage` (excluding transient timer values) to survive page refreshes.

### 2.3. Audio Engine (Hybrid TTS)
**File**: `src/utils/audioEngine.ts`
- **Purpose**: Provides vocal countdowns and metronome ticks.
- **Lag Prevention**: Chained speech utterances in the Web Speech API are notorious for lagging. To fix this, `audioEngine.speak()` calls `window.speechSynthesis.cancel()` immediately before every new utterance.
- **Hardened Browser Fallback**: Browsers like Brave often block TTS voices. The `AudioEngine` includes a `speakWithTones` fallback (currently disabled per user request but present in logic) that uses the **Web Audio API** to generate melodic sine waves if `getVoices()` returns empty.

### 2.4. Picture-in-Picture (PiP) Logic
**Files**: `src/App.tsx`, `src/components/ConcentricTimer.tsx`
- **Persistence Strategy**: To keep the timer active when the user switches apps, a hidden `<canvas>` renders the state of `ConcentricTimer`.
- **Mechanism**: `canvas.captureStream()` is piped into a `<video ref={pipVideoRef}>`.
- **PiP Survival**: The PiP window forces the browser to treat the tab as "Active Foreground Media," preventing the Web Worker from being throttled by OS-level power management.

---

## 3. Component Map

- **`src/App.tsx`**: The orchestrator. Connects the Web Worker to the Zustand store and manages global side effects (Audio Triggers, PiP rendering).
- **`src/components/ConcentricTimer.tsx`**: A pure SVG-based visualization component. It calculates dash-offsets for the circular progress bars based on `timeLeft` and `setTotalDuration`.
- **`src/components/SettingsPanel.tsx`**: A high-density configuration UI using Radix primitives. It allows real-time tuning of performance (e.g., `smoothAnimation`) and aesthetics.
- **`src/utils/audioEngine.ts`**: A singleton class managing the `AudioContext` and `SpeechSynthesis`.

---

## 4. Operational Requirements

### 4.1. Development
- Uses `rolldown-vite` (Rust bundler) for sub-second hot module replacement.
- Tailwind 4.0 for styling.

### 4.2. Gotchas for Agents
1. **Never use `setInterval` in a component** for the main timer. Always delegate to the `timerWorker`.
2. **TTS Timing**: The voice counts down 3, 2, 1. We skip "0" to avoid the delay of starting the next phase's "Rest" or "Go" announcement.
3. **Ref Stability**: The `workerRef` and `pipCanvasRef` in `App.tsx` are critical for maintaining state across renders.
4. **React 19**: The project uses the React Compiler. Avoid manual `useMemo` or `useCallback` unless specifically instructed, as the compiler handles this automatically.

---

*This document is maintained for AI synchronization. When modifying the core state machine or timing logic, update this file.*
