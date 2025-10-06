

# Documentation: Myo-Rep Timer React Application

## 1. Project Overview

### 1.1. Purpose

The Myo-Rep Timer is a specialized, single-page web application designed to guide users through a **Myo-rep training protocol**. This training method consists of:
1.  An initial **Activation Set** with a higher number of repetitions to recruit maximum muscle fibers.
2.  A series of shorter **Myo-rep Sets** with very brief rest periods in between to accumulate a high volume of "effective reps" for muscle growth.

This application automates the timing of work intervals, rest periods, and the transition between the main set and subsequent Myo-rep sets, allowing the user to focus solely on their workout.

### 1.2. Technology Stack

*   **Frontend Library:** [React](https://reactjs.org/) (using Vite for the build environment)
*   **Build Tool:** [Vite](https://vitejs.dev/)
*   **Language:** JavaScript (ES6+)
*   **Styling:** CSS with custom properties (variables) for a modern, dark-mode theme.
*   **Code Protection:** [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator) via the `vite-plugin-javascript-obfuscator` plugin.

---

## 2. Project Structure

The project follows a standard Vite + React structure. The most important files are within the `src` directory.

```
myorep-2/
├── dist/                 # The production-ready, obfuscated build folder (after running `npm run build`)
├── node_modules/         # Project dependencies
├── public/               # Static assets
├── src/
│   ├── App.css           # All styling for the application
│   └── App.js            # The main and only React component, containing all logic and UI
├── .env                  # (Optional) Environment variables
├── index.html            # The entry point for the application
├── package.json          # Project metadata and scripts
└── vite.config.js        # Vite build and plugin configuration (including obfuscation)
```

---

## 3. Component Breakdown: `App.js`

The entire application is encapsulated within the `App.js` component. Below is a detailed breakdown of its every part.

### 3.1. Imports

```javascript
import { useState, useEffect, useCallback } from 'react';
import './App.css';
```
*   `useState`: The fundamental React Hook for adding state variables to the component. It's used to store all user inputs and the timer's current status.
*   `useEffect`: A Hook for handling side effects. Its primary use here is to run the main timer logic—decrementing the `timeLeft` state every second.
*   `useCallback`: A Hook used to memoize the `handleCycleAdvance` function. This prevents the function from being recreated on every render, which is an optimization that helps the `useEffect` Hook work more reliably.
*   `./App.css`: Imports all the styles for the application.

### 3.2. State Management (`useState`)

The component's state is divided into two logical groups:

#### Group 1: User Input & App Phase State

These state variables store the workout parameters entered by the user and control which view is displayed (setup or timer).

*   `sets`: Stores the total number of sets for the workout.
*   `reps`: Stores the number of repetitions in the main Activation Set (Set 1).
*   `seconds`: Stores the duration (in seconds) for each repetition in the main set.
*   `rest`: Stores the duration (in seconds) for the rest period between all sets.
*   `myoReps`: Stores the number of repetitions for each of the Myo-rep sets (Sets 2+).
*   `myoWorkSecs`: Stores the duration (in seconds) for each repetition in the Myo-rep sets.
*   `appPhase`: A string (`'setup'` or `'timer'`) that controls the conditional rendering of the UI.

#### Group 2: Timer Logic State

These variables manage the live state of the timer during an active workout.

*   `currentSet`: Tracks the current set number (e.g., 1 of 4).
*   `currentRep`: Tracks the current repetition number within the current set.
*   `isMainRep`: A boolean that acts as a flag. `true` if the timer is in the main Activation Set (Set 1); `false` if it's in a Myo-rep set.
*   `isWorking`: A boolean flag. `true` during a work interval; `false` during a rest period.
*   `timeLeft`: The core timer value. Stores the number of seconds remaining in the current work or rest interval.
*   `isTimerRunning`: A boolean that controls the `useEffect` timer. `true` to run the timer, `false` to pause it.
*   `timerStatus`: A string displayed to the user (e.g., "Main Rep", "Set Rest", "Finished").

### 3.3. Core Logic & Functions

#### `formatTime(totalSeconds)`
A simple helper function that takes a number (e.g., `95`) and converts it into a `MM:SS` string format (e.g., `"01:35"`).

#### `handleCycleAdvance()`
This is the **brain of the timer**. It is wrapped in `useCallback` for optimization. This function is called *only* when the `timeLeft` reaches `0`. Its job is to decide what to do next.

**The logic flow is as follows:**

1.  **If a work phase just finished (`isWorking` is `true`):**
    *   **Check if it was the Main Set (`isMainRep` is `true`):**
        *   If `currentRep` is less than `totalMainReps`, it just increments `currentRep` and starts another main rep work phase.
        *   If the last main rep was just completed, it checks if the workout is over. If not, it starts a "Set Rest" phase.
    *   **Check if it was a Myo-rep Set (`isMainRep` is `false`):**
        *   If `currentRep` is less than `totalMyoReps`, it increments `currentRep` and starts another Myo-rep work phase.
        *   If the last Myo-rep of the set was completed, it checks if the workout is over. If not, it starts a "Set Rest" phase.

2.  **If a rest phase just finished (`isWorking` is `false`):**
    *   The logic is simple: a rest is always followed by the next set.
    *   It increments `currentSet`, resets `currentRep` to `1`, sets `isMainRep` to `false` (because all subsequent sets are Myo-rep sets), and starts the first Myo-rep of the new set.

#### `process()`
This function acts as the bridge between the setup screen and the timer screen.
1.  It parses all user inputs from strings to integers.
2.  It performs basic validation to ensure all fields are filled with numbers greater than 0.
3.  If validation passes, it initializes the timer's state variables to their starting values (`currentSet: 1`, `isMainRep: true`, etc.).
4.  It kicks off the very first work phase ("Main Rep").
5.  It changes the `appPhase` to `'timer'`, which causes the UI to re-render and show the timer view.

### 3.4. Timer Engine (`useEffect`)

```javascript
useEffect(() => {
  let interval = null;
  if (isTimerRunning && timeLeft > 0) {
    interval = setInterval(() => {
      setTimeLeft(prevTime => prevTime - 1);
    }, 1000);
  } else if (timeLeft === 0 && isTimerRunning) {
    handleCycleAdvance();
  }
  return () => clearInterval(interval);
}, [isTimerRunning, timeLeft, handleCycleAdvance]);
```
This is the heart of the countdown mechanism.
*   **Dependencies:** It runs every time `isTimerRunning`, `timeLeft`, or `handleCycleAdvance` changes.
*   **Logic:**
    *   If the timer is running and time is left, it sets up an interval to decrement `timeLeft` by 1 every 1000ms (1 second).
    *   If `timeLeft` hits `0` and the timer is still running, it stops the countdown and calls `handleCycleAdvance()` to figure out the next phase.
*   **Cleanup:** The `return () => clearInterval(interval)` is a critical cleanup function. It ensures that when the component re-renders, the old interval is destroyed before a new one is created, preventing memory leaks and bugs.

### 3.5. Render Logic (JSX)

The `return` statement uses conditional rendering based on `appPhase`:
*   **If `appPhase === 'setup'`:** It renders a view with a title, instructions, all the `<input>` fields for workout parameters, and a "Start" button.
*   **If `appPhase === 'timer'`:** It renders the active timer view, which includes the current status (`timerStatus`), the set/rep count, the large `timeLeft` display, and the "Pause/Resume" and "End Workout" buttons. The color of the time display changes based on the `isWorking` state to visually distinguish between work and rest.

---

## 4. Code Protection and Obfuscation

A key requirement was to protect the application's source code from being easily copied or reverse-engineered upon deployment. This is achieved through **obfuscation**.

### 4.1. What is Obfuscation?

Obfuscation is the process of deliberately transforming human-readable source code into a functionally identical but extremely difficult-to-read version. It goes far beyond simple minification (which just removes whitespace and shortens variable names).

**The techniques used in this project's obfuscation include:**
*   **Control Flow Flattening:** Scrambles the logical flow of the code into a large `switch` statement inside a `while` loop, making it impossible to follow the original program flow.
*   **Dead Code Injection:** Adds random, non-functional code blocks to confuse anyone trying to analyze the logic.
*   **String Array & Encoding:** Removes all literal strings (like "Main Rep", "Finished") from the code, places them in an encrypted array, and replaces them with calls to a decoder function.
*   **Identifier Renaming:** Renames all variables, functions, and properties to meaningless hexadecimal names (e.g., `_0xabc123`).
*   **Debug Protection:** Includes measures to make it difficult to use browser developer tools to step through the code.

### 4.2. Implementation via `vite.config.js`

This process is automated through the `vite-plugin-javascript-obfuscator`. The configuration in `vite.config.js` is set up to **only apply obfuscation when creating a production build (`npm run build`)**.

```javascript
// vite.config.js (relevant part)
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      // ...react plugin
      mode === 'production' ? obfuscator({ ...options }) : null,
    ],
    build: {
      sourcemap: false,
    },
  };
});
```
*   `mode === 'production'`: This condition is the key. It ensures that when you run the development server (`npm run dev`), the code is NOT obfuscated, allowing for easy debugging.
*   `build: { sourcemap: false }`: This is a critical security step. It prevents Vite from generating source maps, which are files that map the ugly, compiled code back to your beautiful, original source code. Disabling them is essential for protection.

### 4.3. What This Protects (and What It Doesn't)

*   **It Protects Against:**
    *   Casual viewers trying to copy-paste your code.
    *   Competitors trying to quickly understand and replicate your application's logic.
    *   Automated scrapers looking for specific strings or code patterns.
*   **Limitations (The Golden Rule of Client-Side Security):**
    *   Obfuscation is a **deterrent**, not a foolproof security measure. A highly skilled and determined individual can, with enough time and effort, reverse-engineer the code.
    *   **NEVER, EVER embed sensitive information** (like API keys, private credentials, or proprietary algorithms that must remain secret) in client-side JavaScript, even if it is obfuscated. All sensitive data and operations must be handled on a secure backend server.

---

## 5. Build and Deployment

The workflow for testing and deploying the application is managed by npm scripts defined in `package.json`.

1.  **Development (`npm run dev`):** Starts the Vite development server. It serves the original, readable code from the `src` folder and provides features like Hot Module Replacement for a fast development experience.

2.  **Production Build (`npm run build`):** This is the crucial step for deployment. It bundles, optimizes, and **obfuscates** your entire application. The final, ready-to-deploy code is placed in the `dist` folder.

3.  **Previewing the Build (`npm run preview`):** After running `npm run build`, this command starts a local web server to serve the contents of the `dist` folder. This allows you to test the final, obfuscated version of your app on your machine before putting it online.

4.  **Deployment:** To publish the website, upload the **entire contents** of the `dist` folder to a static web hosting provider (e.g., Netlify, Vercel, GitHub Pages).
