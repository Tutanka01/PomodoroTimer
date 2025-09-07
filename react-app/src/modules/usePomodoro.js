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
    case 'SYNC_TIME': {
      const { remaining } = action;
      if (remaining >= 0) {
        const total = state.durations[state.currentMode] * 60;
        return { ...state, timeRemaining: remaining, progress: 1 - (remaining / total) };
      }
      return state; // transitions gérées par COMPLETE_CYCLE
    }
    case 'COMPLETE_CYCLE': {
      if (state.currentMode === 'pomodoro') {
        const newCount = state.pomodoroCount + 1;
        const longBreak = newCount >= SESSIONS_BEFORE_LONG_BREAK;
        return {
          ...state,
          currentMode: longBreak ? 'longBreak' : 'shortBreak',
          timeRemaining: state.durations[longBreak ? 'longBreak' : 'shortBreak'] * 60,
          pomodoroCount: longBreak ? 0 : newCount,
          uiState: 'state-idle', // mettre idle pour que l'utilisateur doive cliquer Start
          progress: 0,
          isRunning: false,
          targetEpoch: null
        };
      }
      return {
        ...state,
        currentMode: 'pomodoro',
        timeRemaining: state.durations.pomodoro * 60,
        uiState: state.isRunning ? 'state-work' : 'state-idle',
        progress: 0,
        targetEpoch: Date.now() + state.durations.pomodoro * 60 * 1000
      };
    }
  case 'START': return { ...state, isRunning: true, uiState: state.currentMode==='pomodoro' ? 'state-work' : 'state-break', targetEpoch: Date.now() + state.timeRemaining * 1000 }; // timeRemaining déjà en secondes
    case 'PAUSE': return { ...state, isRunning: false, uiState: 'state-idle' };
  case 'RESET': return { ...state, isRunning: false, timeRemaining: state.durations[state.currentMode] * 60, uiState: 'state-idle', progress: 0, targetEpoch: null };
  case 'SWITCH_MODE': return { ...state, currentMode: action.mode, timeRemaining: state.durations[action.mode] * 60, isRunning: false, uiState: 'state-idle', progress: 0, targetEpoch: null };
    case 'UPDATE_DURATIONS': return { ...state, durations: action.durations, timeRemaining: action.durations[state.currentMode] * 60, progress: 0 };
    default: return state;
  }
}

export function usePomodoro({ onSessionComplete } = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const intervalRef = useRef(null);
  const lastRemainingRef = useRef(state.timeRemaining);

  useEffect(()=> { localStorage.setItem('flow-timers', JSON.stringify(state.durations)); }, [state.durations]);

  useEffect(()=> {
    if (!state.isRunning || !state.targetEpoch) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    const sync = () => {
      const remainingMs = state.targetEpoch - Date.now();
      const newRemaining = Math.ceil(remainingMs / 1000);
      if (newRemaining !== lastRemainingRef.current && newRemaining >= 0) {
        lastRemainingRef.current = newRemaining;
        dispatch({ type: 'SYNC_TIME', remaining: newRemaining });
      }
      if (remainingMs <= 0) {
        playNotificationSound(state.currentMode==='pomodoro');
        // callback avant mutation pour fournir l'ancien mode avec plage temporelle
        if (onSessionComplete) {
          const duration = state.durations[state.currentMode] * 60;
          const endedAt = new Date();
            const startedAt = new Date(endedAt.getTime() - duration * 1000);
          try { onSessionComplete({ mode: state.currentMode, startedAt, endedAt }); } catch(e){ console.error(e); }
        }
        dispatch({ type: 'COMPLETE_CYCLE' });
      }
    };
    sync();
    intervalRef.current = setInterval(sync, 1000);
    // Re-sync immédiat quand l'onglet redevient visible
    const visHandler = () => sync();
    document.addEventListener('visibilitychange', visHandler);
    return () => { clearInterval(intervalRef.current); intervalRef.current=null; document.removeEventListener('visibilitychange', visHandler); };
  }, [state.isRunning, state.targetEpoch, state.currentMode]);

  useEffect(()=> {
    document.documentElement.style.setProperty('--counter-fill', state.uiState==='state-idle' ? (document.body.classList.contains('theme-night') ? '#e2e8f0' : '#0f172a') : '#e2e8f0');
    const body = document.body;
    body.classList.remove('state-idle','state-work','state-break');
    body.classList.add(state.uiState);
  }, [state.uiState]);

  useEffect(()=> { if (state.isRunning) { ensureAudio().then(()=> { playStartSound(state.currentMode==='pomodoro'); }); } }, [state.isRunning, state.currentMode]);

  // Plus de listener séparé: la fin est gérée dans sync loop

  function start() { dispatch({ type: 'START' }); }
  function pause() { dispatch({ type: 'PAUSE' }); }
  function reset() { dispatch({ type: 'RESET' }); }
  function switchMode(mode) { dispatch({ type: 'SWITCH_MODE', mode }); }
  function updateDurations(durations) { dispatch({ type: 'UPDATE_DURATIONS', durations }); }

  return { state, start, pause, reset, switchMode, updateDurations };
}
