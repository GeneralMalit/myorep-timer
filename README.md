# Myo-Rep v3.7.3

[![Tech Stack](https://img.shields.io/badge/Stack-React_19_+_TypeScript_+_Zustand-61dafb.svg)](https://react.dev/)
[![Build Tool](https://img.shields.io/badge/Build-Rolldown_Vite-ffcf00.svg)](https://rolldown.rs/)
[![Performance](https://img.shields.io/badge/Timing-Sub--millisecond_Accuracy-4caf50.svg)](#sub-millisecond-accuracy)

The Myo-Rep Engine is a high-performance training orchestration system built specifically for the Myo-rep (Autoregulated Rest-Pause) protocol. Unlike generic gym timers, this engine implements a rigorous Finite State Machine (FSM) and a background-prioritized timing core to ensure metabolic stress remains the primary driver of the workout.

---

## 1. The Engineering Challenge

Standard web-based timers suffer from three critical engineering flaws that make them unsuitable for high-intensity protocols like Myo-reps:

1.  **Main Thread Jitter**: JavaScript's single-threaded nature means that DOM updates, heavy CSS animations, or React re-renders can delay `setInterval` or `setTimeout` by tens or even hundreds of milliseconds.
2.  **Background Throttling**: Modern browsers (Chrome, Safari, Brave) aggressively throttle timers in background tabs to save power, causing profound drifts during 30–60 second rest periods.
3.  **Audio Latency**: The Web Speech API is asynchronous. Chaining multiple countdown numbers (e.g., "3... 2... 1... Go") can lead to a speech backlog where the audio lags behind the visual state.

### 1.1. The Myo-Rep Solution

These challenges are addressed through a multi-layered architectural approach:

*   **Sub-millisecond Timing Core**: Timing logic is offloaded to a dedicated Web Worker. Workers run on a separate OS-level thread and are not blocked by the UI's main thread, preserving synchronization even under heavy load.
*   **Drift-Neutral Calculations**: The system utilizes `performance.now()` for delta-time calculations instead of absolute timestamps, ensuring the timer remains frame-independent.
*   **Hybrid Audio Synchronization**: A "Request-to-Cancel" logic is implemented in the `AudioEngine`. Every new speech utterance triggers an immediate `speechSynthesis.cancel()`, flushing the buffer to ensure the current second is always spoken on time.
*   **Video-Captured PiP**: To survive tab backgrounding, the timer state is rendered to a `<canvas>` and piped into a Picture-in-Picture (PiP) `<video>` element. This forces the browser to prioritize the process as "active media," preventing execution suspension.

---

## 2. Full Solution Architecture

### 2.1. System Overview
```mermaid
graph TD
    UI[React 19 Frontend]
    Store[Zustand Store - State Machine]
    Worker[Web Worker Thread]
    Audio[Hybrid Audio Engine]
    PiP[Canvas-to-Video Stream]

    Worker -- "tick {elapsed}" --> Store
    Store -- "notify" --> UI
    Store -- "trigger" --> Audio
    UI -- "render" --> PiP
    
    subgraph "High Priority Assets"
        Audio
        Worker
    end
```

### 2.2. Technology Stack and DevOps
*   **Framework**: React 19 (utilizing the experimental React Compiler for optimized memoization).
*   **Build Engine**: `rolldown-vite` (a high-performance Rust-based bundler).
*   **State Management**: `Zustand` with persistent storage (survives refreshes).
*   **Styling**: `Tailwind CSS 4.0` with specialized Glassmorphism and dark-mode optimization.
*   **Testing**: `Vitest` with `happy-dom` for component and logic verification.
*   **DevOps**: Optimized for zero-config production builds via Vite, with integrated JavaScript obfuscation for IP protection.

---

## 3. Performance Metrics

| Metric | Measurement | Notes |
| :--- | :--- | :--- |
| **Timing Accuracy** | ±1ms | Sustained via Web Worker thread |
| **UI Fluidity** | 60 FPS | Smooth SVG scaling on concentric timer |
| **CPU Overhead** | < 2% | Minimized via React Compiler (automated memo) |
| **TTS Sync** | Clean Skip | Delays eliminated by removing "0" speaking |
| **Cross-Browser** | Brave-Ready | Includes Tone fallbacks for hardened browsers |

---

## 4. Feature Set

### 4.1. Myo-Rep Protocol Logic
- **Phase 1: Activation Set**: Controlled pace to reach effective recruitment.
- **Phase 2: Rest Period**: Auto-calculated interval for partial ATP recovery.
- **Phase 3: Myo-Rep Mini-Sets**: High-frequency cluster sets to maintain recruitment peaked.

### 4.2. Advanced Utilities
- **Concentric Circular Timer**: Visualizes time remaining vs set progress simultaneously.
- **Persistent PiP Window**: Keeps the timer visible over workout logs or video players.
- **Natural Voice TTS**: High-quality vocal coaching with customizable speed and pitch.

---

## 5. Development Guide

### 5.1. Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### 5.2. Testing
```bash
# Run unit tests
npm test

# View test UI
npm run test:ui
```

### 5.3. Production Build
```bash
# Generate optimized build
npm run build
```

### 5.4. UI Layout Editing Guide

The main UI layout now uses dedicated mobile and desktop layout files under [`src/layout/`](./src/layout) so spacing, padding, margins, widths, and alignment can be edited manually without digging through mixed inline Tailwind branches.

Each layout file is also split into smaller internal categories such as:
- `layout`
- `spacing`
- `surface`
- `typography`
- `motion`
- `size`

Those categories are composed into the final exported class strings, so you can adjust one concern at a time instead of editing a single giant utility string.

#### Edit Mobile vs Desktop Layouts

- **App shell and main screens**
  - Mobile: [`src/layout/appShell.mobile.ts`](./src/layout/appShell.mobile.ts)
  - Desktop/web: [`src/layout/appShell.desktop.ts`](./src/layout/appShell.desktop.ts)
  - Controls the main page shell, setup screen shell, timer screen shell, footer, and app dialog container.

- **Sidebar / mobile drawer**
  - Mobile: [`src/layout/sidebar.mobile.ts`](./src/layout/sidebar.mobile.ts)
  - Desktop/web: [`src/layout/sidebar.desktop.ts`](./src/layout/sidebar.desktop.ts)
  - Controls sidebar width, section spacing, saved workout/session layouts, drawer spacing, and footer spacing.

- **Settings drawer**
  - Mobile: [`src/layout/settingsPanel.mobile.ts`](./src/layout/settingsPanel.mobile.ts)
  - Desktop/web: [`src/layout/settingsPanel.desktop.ts`](./src/layout/settingsPanel.desktop.ts)
  - Controls panel width, header padding, section spacing, control row spacing, and content padding.

- **Session builder**
  - Mobile: [`src/layout/sessionBuilder.mobile.ts`](./src/layout/sessionBuilder.mobile.ts)
  - Desktop/web: [`src/layout/sessionBuilder.desktop.ts`](./src/layout/sessionBuilder.desktop.ts)
  - Controls builder page padding, action bar spacing, estimated-time row, canvas frame spacing, and builder dialog layout.

- **Concentric timer**
  - Mobile: [`src/layout/concentricTimer.mobile.ts`](./src/layout/concentricTimer.mobile.ts)
  - Desktop/web: [`src/layout/concentricTimer.desktop.ts`](./src/layout/concentricTimer.desktop.ts)
  - Controls timer size, max width, up/down mode spacing, and timer text spacing.

#### When To Edit `src/layout` vs Component Files

- Edit `src/layout/*.mobile.ts` or `*.desktop.ts` for:
  - padding
  - margins
  - gaps
  - widths
  - shell spacing
  - layout alignment

- Edit component files for structure or behavior:
  - [`src/App.tsx`](./src/App.tsx)
  - [`src/components/Sidebar.tsx`](./src/components/Sidebar.tsx)
  - [`src/components/SettingsPanel.tsx`](./src/components/SettingsPanel.tsx)
  - [`src/components/SessionBuilder.tsx`](./src/components/SessionBuilder.tsx)
  - [`src/components/ConcentricTimer.tsx`](./src/components/ConcentricTimer.tsx)

- Edit [`src/index.css`](./src/index.css) for:
  - theme tokens
  - safe-area variables
  - viewport variables
  - shared global CSS utilities

#### What "Mobile" Means In This Branch

In this branch, **mobile** means any viewport matching the media query:

```css
(max-width: 767px)
```

That includes:
- actual phones
- narrow browser windows
- Chrome DevTools device emulation / responsive mode when the viewport width is `767px` or below

So yes, if you switch Chrome into mobile device mode and the viewport is within that breakpoint, the app will use the `*.mobile.ts` layout files.

The desktop/web layout files apply when the viewport is wider than `767px`.

---

## 6. Versioning

**Current Version: 3.7.3**
- Refactor: `rolldown-vite` integration for improved HMR performance.
- Feature: "Workout Complete" TTS announcement.
- Fix: Enhanced resting phase countdown accuracy and latency reduction.

### 6.1 Automated Semantic Release
- Releases are automated on pushes to `main` via GitHub Actions + `semantic-release`.
- Release workflow uses Node `22.14.0` to satisfy semantic-release runtime requirements.
- Version source of truth is `package.json`.
- `README.md` version lines are synchronized during release (`npm run sync:readme-version`).
- To trigger version bumps, use Conventional Commits:
  - `fix:` -> patch release
  - `feat:` -> minor release
  - `feat!:` or `BREAKING CHANGE:` -> major release

---

*Engineered by General Malit.*
