import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import SettingsPanel from './components/SettingsPanel';
import ConcentricTimer from './components/ConcentricTimer';
import { audioEngine } from './utils/audioEngine';
import timerWorkerUrl from './utils/timerWorker.js?url';
import './App.css';

// --- Default Settings ---
const DEFAULT_SETTINGS = {
  activeColor: '#bb86fc',
  restColor: '#03dac6',
  concentricColor: '#cf6679',
  concentricSecond: 1,
  smoothAnimation: true,
  prepTime: 5, // Default prep time
  fullScreenMode: false,
  metronomeEnabled: true,
  metronomeSound: 'woodblock',
  floatingWindow: false,
  upDownMode: false,
  infoVisibility: 'always', // 'always' | 'resting' | 'never'
  soundMode: 'metronome', // 'metronome' | 'tts'
  pulseEffect: 'always', // 'always' | 'resting' | 'never'
  finishedColor: '#4caf50', // New: Green for finished status
  pipShowInfo: true, // New: Toggle info on PiP
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
  const [worker, setWorker] = useState(null);

  // === 3. Derived Logic (Calculated per render) ===
  const totalRepsCurrentPhase = isMainRep ? parseInt(reps || 0, 10) : parseInt(myoReps || 0, 10);
  const currentRepTotalTime = isMainRep ? parseInt(seconds || 0, 10) : parseInt(myoWorkSecs || 0, 10);

  const outerMax = isWorking ? totalRepsCurrentPhase : parseInt(rest || 1, 10);
  const outerValue = timerStatus === 'Finished'
    ? outerMax
    : (isWorking ? (totalRepsCurrentPhase - currentRep + 1) : timeLeft);

  const innerValue = timeLeft; // Current rep time (Float or Int)
  const innerMax = timerStatus === 'Preparing' ? settings.prepTime : currentRepTotalTime;

  // Floating Window Refs
  const canvasRef = useCallback(node => {
    if (node !== null) {
      window.pipCanvas = node;
    }
  }, []);
  const videoRef = useCallback(node => {
    if (node !== null) {
      window.pipVideo = node;
    }
  }, []);

  // Sync Color to Canvas/PiP
  useEffect(() => {
    const canvas = window.pipCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const color = timerStatus === 'Finished'
      ? settings.finishedColor
      : (timerStatus === 'Preparing' || !isWorking)
        ? settings.restColor
        : (timeLeft <= settings.concentricSecond && timeLeft > 0
          ? settings.concentricColor
          : settings.activeColor
        );

    // Background
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text Overlay
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw Status
    ctx.fillText(timerStatus, canvas.width / 2, 60);

    // Draw Main Time
    ctx.font = 'bold 80px Inter, sans-serif';
    ctx.fillText(Math.ceil(timeLeft), canvas.width / 2, canvas.height / 2);

    // Draw Set/Rep Info
    if (settings.pipShowInfo) {
      ctx.font = '18px Inter, sans-serif';
      if (appPhase === 'timer' && timerStatus !== 'Finished' && timerStatus !== 'Preparing') {
        ctx.fillText(`Set ${currentSet}/${sets}`, canvas.width / 2, canvas.height - 70);
        ctx.fillText(`Rep ${currentRep}/${totalRepsCurrentPhase}`, canvas.width / 2, canvas.height - 40);
      } else if (timerStatus === 'Finished') {
        ctx.fillText('Workout Complete!', canvas.width / 2, canvas.height - 50);
      }
    }
  }, [timeLeft, isWorking, timerStatus, settings, currentSet, sets, currentRep, totalRepsCurrentPhase, appPhase]);

  // Request PiP
  const requestPiP = async () => {
    try {
      const video = window.pipVideo;
      if (video && !document.pictureInPictureElement) {
        if (!video.srcObject) {
          const stream = window.pipCanvas.captureStream();
          video.srcObject = stream;
        }
        await video.play();
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.error("PiP error:", err);
    }
  };

  // Close PiP if setting disabled
  useEffect(() => {
    if (!settings.floatingWindow && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => { });
    }
  }, [settings.floatingWindow]);

  // Init Worker
  useEffect(() => {
    const w = new Worker(timerWorkerUrl, { type: 'module' });
    setWorker(w);
    return () => w.terminate();
  }, []);

  // === Effects: Theme Changes ===

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
      audioEngine.init();
      setCurrentSet(1);
      setCurrentRep(1);
      setIsMainRep(true);
      setIsWorking(true);

      // Init Timers
      setSetTotalDuration(r * sec);
      setSetElapsedTime(0);

      setAppPhase('timer');
      setTimerStatus("Preparing");
      setTimeLeft(settings.prepTime);
      setIsTimerRunning(true);
      if (settings.soundMode === 'tts') audioEngine.speak('Ready');
    } else {
      alert("Please enter valid numbers > 0 for all fields.");
    }
  };

  // Stop/Reset
  const resetWorkout = () => {
    audioEngine.init();
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
      setSetElapsedTime(setTotalDuration); // Ensure outer circle fills
      if (settings.soundMode === 'tts') audioEngine.speak('Complete');
    };

    if (timerStatus === "Preparing") {
      setTimerStatus("Main Set");
      setTimeLeft(mainSecs);
      setIsWorking(true);
      setIsMainRep(true);
      setCurrentRep(1);
      setSetTotalDuration(mainRepsCount * mainSecs);
      setSetElapsedTime(0);
      if (settings.soundMode === 'tts') audioEngine.speak('Go');
      return;
    }

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
            if (settings.soundMode === 'tts') audioEngine.speak('Rest');
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
            if (settings.soundMode === 'tts') audioEngine.speak('Rest');
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
      if (settings.soundMode === 'tts') audioEngine.speak('Start');
    }
  }, [sets, reps, myoReps, seconds, myoWorkSecs, rest, isWorking, isMainRep, currentRep, currentSet, timerStatus, setTotalDuration]);


  // === Timer Interval (Web Worker based) ===
  useEffect(() => {
    if (!worker) return;

    worker.onmessage = (e) => {
      if (e.data.action === 'tick') {
        const isSmooth = settings.smoothAnimation;
        const decrementInternal = isSmooth ? 0.05 : 1;

        setTimeLeft(prev => {
          const next = prev - decrementInternal;
          return next <= 0.001 ? 0 : next;
        });
        setSetElapsedTime(prev => prev + decrementInternal);
      }
    };
  }, [worker, settings.smoothAnimation]);

  useEffect(() => {
    if (!worker) return;

    if (isTimerRunning && timeLeft > 0.001) {
      const isSmooth = settings.smoothAnimation;
      const tickRate = isSmooth ? 50 : 1000;
      worker.postMessage({ action: 'start', interval: tickRate });
    } else {
      worker.postMessage({ action: 'stop' });
      if (timeLeft <= 0.001 && isTimerRunning && timerStatus !== 'Finished') {
        handleCycleAdvance();
      }
    }

    const currentWorker = worker;
    return () => {
      currentWorker.postMessage({ action: 'stop' });
    };
  }, [isTimerRunning, timerStatus, handleCycleAdvance, worker, settings.smoothAnimation, (timeLeft <= 0.001)]);
  // Note: We only re-trigger if timeLeft crosses the 0 threshold

  // We need to track the "last played second" to avoid multi-triggering in smooth mode
  const [lastTickSecond, setLastTickSecond] = useState(-1);

  useEffect(() => {
    if (isTimerRunning && settings.metronomeEnabled && isWorking && timerStatus !== 'Preparing') {
      const currentSecond = Math.ceil(timeLeft);
      if (currentSecond !== lastTickSecond && currentSecond >= 0) {
        if (settings.soundMode === 'tts') {
          audioEngine.speak(currentSecond);
        } else {
          audioEngine.playTick(settings.metronomeSound);
        }
        setLastTickSecond(currentSecond);
      }
    } else {
      // Reset tick tracking when paused or not working
      setLastTickSecond(-1);
    }
  }, [timeLeft, isTimerRunning, settings.metronomeEnabled, isWorking, timerStatus, settings.metronomeSound, lastTickSecond, settings.soundMode]);

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
            <div className={`timer-container fade-in ${settings.fullScreenMode ? 'full-screen-active' : ''}`}>
              {(settings.infoVisibility === 'always' || (settings.infoVisibility === 'resting' && !isWorking)) && (
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
              )}

              {/* Dynamic Background for Full Screen Mode */}
              {settings.fullScreenMode && (
                <div
                  className="full-screen-bg"
                  style={{
                    backgroundColor: timerStatus === 'Finished'
                      ? settings.finishedColor
                      : (timerStatus === 'Preparing' || !isWorking)
                        ? settings.restColor
                        : (timeLeft <= settings.concentricSecond && timeLeft > 0
                          ? settings.concentricColor
                          : settings.activeColor
                        )
                  }}
                />
              )}

              <ConcentricTimer
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
                textSub={timerStatus === 'Preparing' ? "Get Ready" : (!isWorking ? "Resting" : (timerStatus === 'Finished' ? "Session Clear" : `Rep ${currentRep} / ${totalRepsCurrentPhase}`))}
                isFinished={timerStatus === 'Finished'}
                isPreparing={timerStatus === 'Preparing'}
              />

              <div className="controls">
                <button
                  className={`control-btn ${isTimerRunning ? 'pause' : 'resume'}`}
                  onClick={() => {
                    audioEngine.init();
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

              {settings.floatingWindow && (
                <div className="pip-request-container">
                  <button className="pip-btn" onClick={requestPiP}>
                    {document.pictureInPictureElement ? 'Floating Window Active' : 'Open Floating Window'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="main-footer">
          <div className="footer-content">
            <span>MyoRep Timer 2.2.2</span>
            <span className="separator">•</span>
            <span>by General Malit</span>
          </div>
        </footer>

        {/* Persistent PiP Elements (outside active workout container to persist) */}
        <div style={{ display: 'none' }}>
          <canvas ref={canvasRef} width="300" height="300" />
          <video ref={videoRef} autoPlay muted />
        </div>
      </div>
    </div>
  );
}

export default App;
