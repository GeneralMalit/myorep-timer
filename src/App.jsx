import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import SettingsPanel from './components/SettingsPanel';
import ConcentricTimer from './components/ConcentricTimer';
import './App.css';

// --- Default Settings ---
const DEFAULT_SETTINGS = {
  activeColor: '#bb86fc',
  restColor: '#03dac6',
  criticalRepColor: '#cf6679',
  lastSecondThreshold: 1, // Change color when 1s remains
  smoothAnimation: true,
};

// --- Theme Presets (Mapping IDs to colors for immediate use if needed) ---
const THEMES = {
  'theme-default': { activeColor: '#bb86fc' },
  'theme-ocean': { activeColor: '#00b4d8' },
  'theme-fire': { activeColor: '#e63946' },
  'theme-forest': { activeColor: '#2a9d8f' },
};

// --- Helper: Time Formatter ---
const formatTime = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

function App() {
  // === 1. UI & Settings State ===
  const [currentTheme, setCurrentTheme] = useState('theme-default');
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // === 2. Workout Input State ===
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [seconds, setSecs] = useState('');
  const [rest, setRest] = useState('');
  const [myoReps, setMyoReps] = useState('');
  const [myoWorkSecs, setMyoWorkSecs] = useState('');

  // === 3. Timer Logic State ===
  const [appPhase, setAppPhase] = useState('setup'); // 'setup' | 'timer'
  const [timerStatus, setTimerStatus] = useState("Ready");
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Counters
  const [currentSet, setCurrentSet] = useState(1);
  const [currentRep, setCurrentRep] = useState(1);
  const [isMainRep, setIsMainRep] = useState(true);
  const [isWorking, setIsWorking] = useState(true);

  // Time Tracking (Standard)
  const [timeLeft, setTimeLeft] = useState(0); // Current phase time (Rep duration or Rest duration)

  // === 4. Derived Logic ===
  // Outer Circle now tracks REPS REMAINING.
  const totalRepsCurrentPhase = isMainRep ? parseInt(reps || 0, 10) : parseInt(myoReps || 0, 10);

  // Inner Circle tracks Rep Time
  const currentRepTotalTime = isMainRep ? parseInt(seconds || 0, 10) : parseInt(myoWorkSecs || 0, 10);

  // === 4. Derived Time Tracking for Concentric Circles ===
  // We need to track the "Total Time" for the outer circle (Whole Set)
  // and "Current Rep Time" for inner circle.

  // "timeLeft" effectively tracks the Inner Circle when working, or Outer when resting?
  // User req:
  // - Outer: Timer of whole set.
  // - Inner: Timer of rep.

  // So we need a SEPARATE counter for the Set Duration.
  // Calculated when a set starts: (TotalReps * TimePerRep)
  // But wait, myo-reps are dynamic.
  // Let's approximate:
  // If Main Set: TotalDuration = reps * seconds
  // If Myo Set: TotalDuration = myoReps * myoWorkSecs

  const [setTotalDuration, setSetTotalDuration] = useState(0);
  const [setElapsedTime, setSetElapsedTime] = useState(0);
  // Note: setElapsedTime increments as we go.

  // === Effects: Theme Changes ===
  useEffect(() => {
    const themeColors = THEMES[currentTheme];
    if (themeColors) {
      setSettings(prev => ({ ...prev, activeColor: themeColors.activeColor }));
      document.documentElement.style.setProperty('--primary-color', themeColors.activeColor);
    }
  }, [currentTheme]);

  // === Handlers ===
  const handleSets = (e) => setSets(e.target.value);
  const handleReps = (e) => setReps(e.target.value);
  const handleSecs = (e) => setSecs(e.target.value);
  const handleRest = (e) => setRest(e.target.value);
  const handleMyoReps = (e) => setMyoReps(e.target.value);
  const handleMyoWorkSecs = (e) => setMyoWorkSecs(e.target.value);

  // Start Workout
  const startWorkout = () => {
    const s = parseInt(sets, 10);
    const r = parseInt(reps, 10);
    const sec = parseInt(seconds, 10);
    const rst = parseInt(rest, 10);
    const mr = parseInt(myoReps, 10);
    const msec = parseInt(myoWorkSecs, 10);

    if (s > 0 && r > 0 && sec > 0 && rst > 0 && mr > 0 && msec > 0) {
      setCurrentSet(1);
      setCurrentRep(1);
      setIsMainRep(true);
      setIsWorking(true);

      // Init Timers
      setTimeLeft(sec); // Initial rep time
      setSetTotalDuration(r * sec); // Total set time
      setSetElapsedTime(0);

      setAppPhase('timer');
      setTimerStatus("Main Set");
      setIsTimerRunning(true);
    } else {
      alert("Please enter valid numbers > 0 for all fields.");
    }
  };

  // Stop/Reset
  const resetWorkout = () => {
    setIsTimerRunning(false);
    setAppPhase('setup');
    setTimerStatus("Ready");
  };

  // === Cycle Advance Logic ===
  const handleCycleAdvance = useCallback(() => {
    const totalSets = parseInt(sets, 10);
    const mainRepsCount = parseInt(reps, 10);
    const myoRepsCount = parseInt(myoReps, 10);
    const mainSecs = parseInt(seconds, 10);
    const myoSecs = parseInt(myoWorkSecs, 10);
    const restSecs = parseInt(rest, 10);

    // Helper to finish
    const finish = () => {
      setIsTimerRunning(false);
      setTimerStatus("Finished");
      setTimeLeft(0);
    };

    if (isWorking) {
      // Just finished a rep
      if (isMainRep) {
        if (currentRep < mainRepsCount) {
          // Next Main Rep
          setCurrentRep(prev => prev + 1);
          setTimeLeft(mainSecs);
          // Set Elapsed Time update happens in the interval
        } else {
          // Finished Main Set -> Rest
          if (currentSet < totalSets) {
            setIsWorking(false);
            setTimeLeft(restSecs);
            setTimerStatus("Resting");
            // For Rest, let's say "Outer Circle" tracks rest time?
            // User: "Outer Concentric Circle: ... changes colors when we are at rest to signify that we are resting"
            // So during rest, Outer Circle = Timer of Rest.
            setSetTotalDuration(restSecs);
            setSetElapsedTime(0);
          } else {
            finish();
          }
        }
      } else {
        // Myo Rep Phase
        if (currentRep < myoRepsCount) {
          setCurrentRep(prev => prev + 1);
          setTimeLeft(myoSecs);
        } else {
          // Finished Myo Set -> Rest (if more sets) or Finish?
          // Usually MyoReps end after the cluster.
          // Assuming user wants Multi-Set MyoReps?
          // If "Total Sets" > 1, we treat this entire block as ONE set and loop?
          // Or: Each "Set" contains Main Reps?
          // Usually: Activation Set + Rest + Mini + Rest + Mini...

          // Let's stick to the SIMPLE old logic to avoid breaking user workflow:
          // Loop Reps -> When done, check Sets.
          // BUT: Logic says:
          // If Main Reps done -> Rest.
          // If Myo Reps done -> Rest.
          // So basically, if I am in Main Rep phase, Next Phase is Rest.
          // AFTER Rest -> Next Set.

          if (currentSet < totalSets) {
            setIsWorking(false);
            setTimeLeft(restSecs);
            setTimerStatus("Resting");
            setSetTotalDuration(restSecs);
            setSetElapsedTime(0);
          } else {
            finish();
          }
        }
      }
    } else {
      // Just finished Rest -> Start Next Set
      // Next set: Is it Main or Myo?
      // Old code:
      // if (isWorking) ... else { setCurrentSet++; setIsMainRep(false); startWorkPhase(myoWorkSecs...) }
      // This implies: Set 1 = Main. Set 2, 3, 4 = Myo Rep Sets.
      // YES. That matches Myo-Rep protocol (Activation Set -> Mini Sets).

      setCurrentSet(prev => prev + 1);

      // Set 1 is Main. Sets 2+ are Myo.
      // Actually old code set `isMainRep(false)` immediately after first rest.
      setIsMainRep(false);
      setCurrentRep(1);
      setIsWorking(true);
      setTimeLeft(myoSecs);

      setSetTotalDuration(myoRepsCount * myoSecs);
      setSetElapsedTime(0);
      setTimerStatus("Myo Reps");
    }
  }, [sets, reps, myoReps, seconds, myoWorkSecs, rest, isWorking, isMainRep, currentRep, currentSet]);


  // === Timer Interval ===
  useEffect(() => {
    let interval = null;
    if (isTimerRunning && timeLeft > 0.001) { // Float safety
      const isSmooth = settings.smoothAnimation;
      const tickRate = isSmooth ? 50 : 1000; // 50ms implies 20fps for super smooth
      const decrement = isSmooth ? 0.05 : 1;

      interval = setInterval(() => {
        setTimeLeft(prev => {
          const next = prev - decrement;
          return next < 0 ? 0 : next;
        });

        setSetElapsedTime(prev => prev + decrement);
      }, tickRate);
    } else if (timeLeft <= 0.001 && isTimerRunning && timerStatus !== 'Finished') {
      // Allow a brief render at 0 before advancing? 
      // With high-res, we hit 0.0 quickly. 
      // If we advance immediately, we might still miss the 0 frame if React batches.
      // But usually it's fine.
      handleCycleAdvance();
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft, timerStatus, handleCycleAdvance, settings.smoothAnimation]);

  // === Calculation for Timer Props ===
  const outerTimeLeft = isWorking ? (setTotalDuration - setSetElapsedTime) : timeLeft;
  const outerTotal = isWorking ? setTotalDuration : parseInt(rest || 1, 10);

  // Outer Value (Reps Logic)
  // Logic: "Reps Remaining". 
  // We want to show partial reps? 
  // The outer circle ticks DOWN per rep.
  // Ideally it stays FULL for the current rep, then ticks down when rep finishes?
  // User: "The outer concentric circle should measure the amount of REPS REMAINING IN THE SET"
  // If we are at Rep 1 of 15. Outer should be Full? Or 14/15?
  // Let's keep it stepping. Visual: 15 segments.
  const outerValue = isWorking ? (totalRepsCurrentPhase - currentRep + 1) : timeLeft;
  const outerMax = isWorking ? totalRepsCurrentPhase : parseInt(rest || 1, 10);

  const innerValue = timeLeft; // Current rep time (Float or Int)
  const innerMax = currentRepTotalTime;

  // Format Display: Ceil for standard Countdown look (3.9 -> 4, 0.1 -> 1, 0.0 -> 0)
  const displaySeconds = Math.ceil(timeLeft);

  return (
    <div className={`app-root theme-${currentTheme}`}>
      <Sidebar
        currentTheme={currentTheme}
        setTheme={setCurrentTheme}
        setShowSettings={setShowSettings}
        showSettings={showSettings}
        isCollapsed={isSidebarCollapsed}
        toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        setSettings={setSettings}
      />

      <div className={`main-content ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="content-wrapper">
          {appPhase === 'setup' && (
            <div className="setup-container fade-in">
              <h1>Setup Workout</h1>
              <p className="subtitle">Configure your hypertrophy protocol.</p>

              <div className="input-grid">
                <div className="input-group">
                  <label>Total Sets (Cycles)</label>
                  <input type="number" value={sets} onChange={handleSets} placeholder="e.g. 5" />
                </div>
                <div className="input-group">
                  <label>Main Reps (Set 1)</label>
                  <input type="number" value={reps} onChange={handleReps} placeholder="e.g. 15" />
                </div>
                <div className="input-group">
                  <label>Time per Main Rep (s)</label>
                  <input type="number" value={seconds} onChange={handleSecs} placeholder="e.g. 4" />
                </div>
                <div className="input-group">
                  <label>Rest Interval (s)</label>
                  <input type="number" value={rest} onChange={handleRest} placeholder="e.g. 20" />
                </div>
                <div className="input-group">
                  <label>Myo Reps (Sets 2+)</label>
                  <input type="number" value={myoReps} onChange={handleMyoReps} placeholder="e.g. 4" />
                </div>
                <div className="input-group">
                  <label>Time per Myo Rep (s)</label>
                  <input type="number" value={myoWorkSecs} onChange={handleMyoWorkSecs} placeholder="e.g. 3" />
                </div>
              </div>

              <button className="start-btn" onClick={startWorkout}>
                Initialize System
              </button>

              <div className="info-card">
                <h3>Protocol Info</h3>
                <p>Activation Set (Set 1) recruits fibers. Myo Reps (Sets 2+) maintain high fiber recruitment with short rests.</p>
              </div>
            </div>
          )}

          {appPhase === 'timer' && (
            <div className="timer-container fade-in">
              <div className="timer-header">
                <h2>{timerStatus}</h2>
                <div className="badges">
                  <span className="badge">Set {currentSet}/{sets}</span>
                  {!isWorking && (
                    <span className="badge">{isMainRep ? 'Activation' : 'Myo Phase'}</span>
                  )}
                  <span className="badge">Rep {currentRep}</span>
                </div>
              </div>

              <ConcentricTimer
                key={`${appPhase}-${currentSet}-${currentRep}-${isWorking}`}
                outerValue={outerValue}
                outerMax={outerMax}
                isResting={!isWorking}
                innerValue={innerValue}
                innerMax={innerMax}
                settings={settings}
                smoothAnimation={settings.smoothAnimation}
                currentRep={currentRep}
                totalReps={totalRepsCurrentPhase}
                textMain={formatTime(Math.ceil(timeLeft))}
                textSub={!isWorking ? "Resting" : `Rep ${currentRep} / ${totalRepsCurrentPhase}`}
              />

              <div className="controls">
                <button
                  className={`control-btn ${isTimerRunning ? 'pause' : 'resume'}`}
                  onClick={() => {
                    if (timerStatus === 'Finished') resetWorkout();
                    else setIsTimerRunning(!isTimerRunning);
                  }}
                >
                  {timerStatus === 'Finished' ? 'New Workout' : (isTimerRunning ? 'Pause' : 'Resume')}
                </button>

                <button className="control-btn stop" onClick={resetWorkout}>
                  End Session
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="main-footer">
          <div className="footer-content">
            <span>MyoRep Timer v2.0.0</span>
            <span className="separator">•</span>
            <span>by General Malit</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
