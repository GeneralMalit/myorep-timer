import { useState, useEffect, useCallback } from 'react';
import './App.css';

// Helper function to convert seconds to MM:SS format
const formatTime = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// =======================================================
// === NEW: Footer Component Definition ===
// =======================================================
const Footer = () => {
  return (
    <footer className="app-footer">
      <p>&copy; {new Date().getFullYear()} MyoREP Timer by General Malit.</p>
    </footer>
  );
};


function App() {
  // === 1. Input State ===
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [seconds, setSecs] = useState('');
  const [rest, setRest] = useState('');
  const [appPhase, setAppPhase] = useState('setup');
  const [myoReps, setMyoReps] = useState('');
  const [myoWorkSecs, setMyoWorkSecs] = useState('');

  // === 2. Timer State ===
  const [currentSet, setCurrentSet] = useState(1);
  const [currentRep, setCurrentRep] = useState(1);
  const [isMainRep, setIsMainRep] = useState(true);
  const [isWorking, setIsWorking] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStatus, setTimerStatus] = useState("Ready");

  // === 3. Input Handlers ===
  const handleSets = (event) => { setSets(event.target.value) }
  const handleReps = (event) => { setReps(event.target.value) }
  const handleSecs = (event) => { setSecs(event.target.value) }
  const handleRest = (event) => { setRest(event.target.value) }
  const handleMyoReps = (event) => { setMyoReps(event.target.value) }
  const handleMyoWorkSecs = (event) => { setMyoWorkSecs(event.target.value) }


  // === Helper Functions for Timer State Management ===
  const startWorkPhase = (duration, status) => {
    setIsWorking(true);
    setTimeLeft(duration);
    setTimerStatus(status);
    setIsTimerRunning(true);
  }

  const startRestPhase = (duration, status) => {
    setIsWorking(false);
    setTimeLeft(duration);
    setTimerStatus(status);
    setIsTimerRunning(true);
  }

  // === 6. Cycle Advance Logic ===
  const handleCycleAdvance = useCallback(() => {
    const totalSets = parseInt(sets, 10) || 0;
    const totalMainReps = parseInt(reps, 10) || 0;
    const totalMyoReps = parseInt(myoReps, 10) || 0;
    const mainWorkSecs = parseInt(seconds, 10) || 0;
    const myoWorkSecsVal = parseInt(myoWorkSecs, 10) || 0;
    const setRestSecs = parseInt(rest, 10) || 0;

    const finishWorkout = () => {
      setIsTimerRunning(false);
      setTimerStatus("Finished");
      setTimeLeft(0);
    }

    if (isWorking) {
      if (isMainRep) {
        if (currentRep < totalMainReps) {
          setCurrentRep(prev => prev + 1);
          startWorkPhase(mainWorkSecs, "Main Rep");
        } else {
          if (currentSet < totalSets) {
            startRestPhase(setRestSecs, "Set Rest");
          } else {
            finishWorkout();
          }
        }
      } else {
        if (currentRep < totalMyoReps) {
          setCurrentRep(prev => prev + 1);
          startWorkPhase(myoWorkSecsVal, "Myo Rep");
        } else {
          if (currentSet < totalSets) {
            startRestPhase(setRestSecs, "Set Rest");
          } else {
            finishWorkout();
          }
        }
      }
    } else {
      setCurrentSet(prev => prev + 1);
      setCurrentRep(1);
      setIsMainRep(false);
      startWorkPhase(myoWorkSecsVal, "Myo Rep");
    }
  }, [
    sets, reps, myoReps, seconds, myoWorkSecs, rest,
    isWorking, isMainRep, currentRep, currentSet
  ]);


  // === 4. Process (Start) Function ===
  const process = () => {
    const s = parseInt(sets, 10) || 0;
    const r = parseInt(reps, 10) || 0;
    const sec = parseInt(seconds, 10) || 0;
    const setRest = parseInt(rest, 10) || 0;
    const myoWSec = parseInt(myoWorkSecs, 10) || 0;
    const myoR = parseInt(myoReps, 10) || 0;

    if (s > 0 && r > 0 && sec > 0 && setRest > 0 && myoWSec > 0 && myoR > 0) {
      setCurrentSet(1);
      setCurrentRep(1);
      setIsMainRep(true);
      startWorkPhase(sec, "Main Rep");
      setAppPhase('timer');
    } else {
      alert("Please ensure all inputs are valid numbers greater than 0.");
    }
  };

  // === 5. Timer Logic (useEffect) ===
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


  // =======================================================
  // === EDITED: Main Render Logic with Footer ===
  // =======================================================
  return (
    <div className="site-container">
      <main>
        {appPhase === 'setup' && (
          <div className="app-container">
            <h1>MyoREP Timer</h1>
            <p>Please enter your myo-rep workout details.</p>
            <div>
              <input type="number" placeholder="Total Sets" value={sets} onChange={handleSets} />
              <input type="number" placeholder="Main Reps (Set 1)" value={reps} onChange={handleReps} />
              <input type="number" placeholder="Main Work (Seconds)" value={seconds} onChange={handleSecs} />
              <input type="number" placeholder="Rest (Seconds)" value={rest} onChange={handleRest} />
              <input type="number" placeholder="Myo Reps (Sets 2+)" value={myoReps} onChange={handleMyoReps} />
              <input type="number" placeholder="Myo Rep Work (Secs)" value={myoWorkSecs} onChange={handleMyoWorkSecs} />
            </div>
            <div>
              <button onClick={process}>Start</button>
            </div>
            <div className="info-section">
              <h2>Understanding Myo-Reps</h2>
              <p>Myo-reps are a time-efficient training technique to maximize muscle growth. The protocol involves an initial "activation set" to recruit muscle fibers, followed by several shorter "mini-sets" with very brief rest periods to accumulate more effective, growth-stimulating reps.</p>
            </div>
          </div>
        )}

        {appPhase === 'timer' && (
          <div className="app-container timer-view">
            <h1>{timerStatus === 'Finished' ? 'Workout Complete!' : timerStatus}</h1>

            <p className="timer-status-text">
              {timerStatus === 'Finished'
                ? 'Great Job!'
                : `Set ${currentSet} of ${parseInt(sets, 10)} | ${isMainRep ? `Main Rep ${currentRep} of ${parseInt(reps, 10)}` : `Myo Rep ${currentRep} of ${parseInt(myoReps, 10)}`}`}
            </p>

            <h2 className={`timer-time-display ${!isWorking && timerStatus !== 'Finished' ? 'resting' : ''}`}>
              {formatTime(timeLeft)}
            </h2>

            <div className="timer-controls">
              <button onClick={() => setIsTimerRunning(!isTimerRunning)}>
                {isTimerRunning ? 'Pause' : (timerStatus === 'Finished' ? 'Restart' : 'Resume')}
              </button>
              <button onClick={() => {
                setIsTimerRunning(false);
                setAppPhase('setup');
              }}>
                End Workout / Setup
              </button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;