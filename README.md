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
*   **Audio Engine:** Custom-built audio engine for metronome functionality.

---

## 2. Project Structure

The project follows a standard Vite + React structure. The most important files are within the `src` directory.

```
myorep-2/
├── dist/                 # The production-ready, obfuscated build folder (after running `npm run build`)
├── node_modules/         # Project dependencies
├── public/               # Static assets
├── src/
│   ├── App.css           # Styling for the application
│   ├── App.jsx           # Main React component, containing logic and UI
│   ├── components/       # Reusable components (e.g., Sidebar, Timer, SettingsPanel)
│   ├── utils/            # Utility functions (e.g., audioEngine.js for metronome)
├── .env                  # (Optional) Environment variables
├── index.html            # The entry point for the application
├── package.json          # Project metadata and scripts
└── vite.config.js        # Vite build and plugin configuration (including obfuscation)
```

---

## 3. New Features

### 3.1. Full-Screen Mode
- Added a full-screen mode for an immersive workout experience.
- Dynamic background color changes based on the workout phase.

### 3.2. Metronome Functionality
- Integrated a metronome with customizable sounds (e.g., woodblock, mechanical, electronic).
- Helps users maintain a consistent rhythm during workouts.

### 3.3. Enhanced Timer UI
- Concentric timer with inner and outer circles to track reps and set progress.
- Smooth animations and critical rep indicators.

### 3.4. Fixed Timer Desync
- Resolved an issue where the timer would desynchronize when the browser tab was not in focus.

### 3.5. Floating Window Option
- Introduced a floating window feature, allowing users to multitask while keeping the timer visible during workouts.

---

## 4. How to Run

1. Clone the repository:
   ```bash
   git clone https://github.com/GeneralMalit/myorep-timer.git
   ```

2. Navigate to the project directory:
   ```bash
   cd myorep-timer
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open the application in your browser at `http://localhost:3000`.

---

## 5. Build for Production

To create a production-ready build, run:
```bash
npm run build
```
The output will be in the `dist/` directory.

---

## 6. License

This project is licensed under the MIT License. See the `LICENSE` file for details.
