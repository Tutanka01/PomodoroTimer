import { useReducer, useEffect, useRef } from 'react';
import { ensureAudio, playStartSound, playNotificationSound } from './sound.js';

const SESSIONS_BEFORE_LONG_BREAK = 4;

const initialDurations = JSON.parse(localStorage.getItem('flow-timers')) || { pomodoro: 25, shortBreak: 5, longBreak: 15 };

const initialState = {
  currentMode: 'pomodoro',
  durations: initialDurations,
  timeRemaining: initialDurations.pomodoro * 60,
  isRunning: false,
  pomodoroCount: 0,
  uiState: 'state-idle',
  progress: 0,
  targetEpoch: null
};

function reducer(state, action) {
  switch(action.type) {
  case 'TICK': {
      const next = state.timeRemaining - 1;
      if (next >= 0) {
        const total = state.durations[state.currentMode] * 60;
        return { ...state, timeRemaining: next, progress: 1 - (next / total) };
      }
      // switch
      if (state.currentMode === 'pomodoro') {
        const newCount = state.pomodoroCount + 1;
        const longBreak = newCount >= SESSIONS_BEFORE_LONG_BREAK;
        return {
          ...state,
            currentMode: longBreak ? 'longBreak' : 'shortBreak',
            timeRemaining: state.durations[longBreak ? 'longBreak' : 'shortBreak'] * 60,
            pomodoroCount: longBreak ? 0 : newCount,
            uiState: 'state-break',
            progress: 0
        };
      } else {
  return { ...state, currentMode: 'pomodoro', timeRemaining: state.durations.pomodoro * 60, uiState: state.isRunning ? 'state-work' : 'state-idle', progress: 0 };
      }
    }
  case 'START': return { ...state, isRunning: true, uiState: state.currentMode==='pomodoro' ? 'state-work' : 'state-break', targetEpoch: Date.now() + state.timeRemaining * 1000 };
    case 'PAUSE': return { ...state, isRunning: false, uiState: 'state-idle' };
  case 'RESET': return { ...state, isRunning: false, timeRemaining: state.durations[state.currentMode] * 60, uiState: 'state-idle', progress: 0, targetEpoch: null };
  case 'SWITCH_MODE': return { ...state, currentMode: action.mode, timeRemaining: state.durations[action.mode] * 60, isRunning: false, uiState: 'state-idle', progress: 0, targetEpoch: null };
    case 'UPDATE_DURATIONS': return { ...state, durations: action.durations, timeRemaining: action.durations[state.currentMode] * 60, progress: 0 };
    default: return state;
  }
}

export function usePomodoro() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const rafRef = useRef(null);
  const lastSecondRef = useRef(state.timeRemaining);

  useEffect(()=> { localStorage.setItem('flow-timers', JSON.stringify(state.durations)); }, [state.durations]);

  useEffect(()=> {
    if (!state.isRunning) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return; }
    let mounted = true;
    const tickLoop = () => {
      if (!mounted) return;
      const now = Date.now();
      const remainingMs = state.targetEpoch - now;
      const newRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
      if (newRemaining !== lastSecondRef.current) {
        lastSecondRef.current = newRemaining;
        // accent derniers 3s
        dispatch({ type: 'TICK' });
      }
      if (remainingMs <= 0) {
        // fin cycle déjà gérée par TICK suivant; laisser loop pour prochaine session
      } else {
        rafRef.current = requestAnimationFrame(tickLoop);
      }
    };
    rafRef.current = requestAnimationFrame(tickLoop);
    return () => { mounted = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state.isRunning, state.targetEpoch]);

  useEffect(()=> {
    document.documentElement.style.setProperty('--counter-fill', state.uiState==='state-idle' ? (document.body.classList.contains('theme-night') ? '#e2e8f0' : '#0f172a') : '#e2e8f0');
    const body = document.body;
    body.classList.remove('state-idle','state-work','state-break');
    body.classList.add(state.uiState);
  }, [state.uiState]);

  useEffect(()=> { if (state.isRunning) { ensureAudio().then(()=> { playStartSound(state.currentMode==='pomodoro'); }); } }, [state.isRunning, state.currentMode]);

  useEffect(()=> { if (state.timeRemaining === 0 && state.isRunning) { playNotificationSound(state.currentMode==='pomodoro'); } }, [state.timeRemaining, state.isRunning, state.currentMode]);

  function start() { dispatch({ type: 'START' }); }
  function pause() { dispatch({ type: 'PAUSE' }); }
  function reset() { dispatch({ type: 'RESET' }); }
  function switchMode(mode) { dispatch({ type: 'SWITCH_MODE', mode }); }
  function updateDurations(durations) { dispatch({ type: 'UPDATE_DURATIONS', durations }); }

  return { state, start, pause, reset, switchMode, updateDurations };
}
