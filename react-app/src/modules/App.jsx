import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TimerDisplay } from './TimerDisplay.jsx';
import { ModeSelector } from './ModeSelector.jsx';
import { Intention } from './Intention.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { useTheme } from './useTheme.js';
import { usePomodoro } from './usePomodoro.js';
import { logSession, fetchRecentStats } from './sessionStore.js';
import { t } from './i18n.js';
import { useAuth } from './useAuth.js';
import { Link } from 'react-router-dom';

export default function App() {
  const { theme, toggleTheme, isDark } = useTheme();
  const [pendingRating, setPendingRating] = useState(null); // { startedAt, endedAt, intention }
  const { state, start, pause, reset, switchMode, updateDurations } = usePomodoro({
    onSessionComplete: async ({ mode, startedAt, endedAt }) => {
      if (mode==='pomodoro' && user) {
        setPendingRating({ mode, startedAt, endedAt, intention });
      } else {
        await logSession({ user, mode, startedAt, endedAt, intention });
        if (user) refreshStats();
      }
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [intention, setIntention] = useState('');
  const { user, loading: authLoading, error: authError, signIn, signUp, signOut } = useAuth();
  const [stats, setStats] = useState({ sessions: [], daily: [] });

  async function refreshStats() {
    if (!user) return;
    const data = await fetchRecentStats(user, { days: 7 });
    setStats(data);
  }
  useEffect(()=> { if (user) refreshStats(); }, [user]);

  // minimal session logging (client-only for now) when a pomodoro completes
  useEffect(()=> {
    if(!user) return;
    // simple channel to listen later (placeholder)
  }, [user]);

  useEffect(() => {
    document.body.classList.remove('theme-day', 'theme-night');
    document.body.classList.add(isDark ? 'theme-night' : 'theme-day');
  }, [isDark]);

  const onLongPress = useCallback(() => setShowSettings(true), []);

  return (
    <main className={`min-h-screen w-full flex flex-col items-center justify-center p-4 transition-all duration-1000 ${state.uiState}`}>      
      <div className="top-controls absolute top-6 right-6 z-20 flex items-center space-x-4 transition-all duration-500">
        <ThemeToggle isDark={isDark} toggle={toggleTheme} />
        {user ? (
          <>
            <Link to="/dashboard" className="text-xs opacity-70 hover:opacity-100 underline">Dashboard</Link>
            <button onClick={signOut} className="text-xs opacity-70 hover:opacity-100 transition-colors underline">{t('logout')}</button>
          </>
        ) : (
          <Link to="/login" className="text-xs opacity-80 hover:opacity-100 rounded-full px-3 py-1 bg-white/20 dark:bg-white/10 backdrop-blur-md border border-white/30 shadow-sm transition-colors">{t('login')}</Link>
        )}
      </div>
      <div className="glass-container w-full max-w-lg mx-auto rounded-3xl shadow-2xl p-6 sm:p-10 text-center relative">
        <ModeSelector currentMode={state.currentMode} switchMode={switchMode} />
        <div className="relative mb-6">
          <TimerDisplay timeRemaining={state.timeRemaining} onLongPress={onLongPress} modeClass={state.isRunning ? (state.currentMode==='pomodoro' ? 'timer-work' : 'timer-break') : 'timer-idle'} />
          <div className="h-1 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mt-4">
            <div className="h-full bg-gradient-to-r from-pink-500 to-indigo-500 transition-all duration-700" style={{ width: `${Math.round(state.progress*100)}%` }} />
          </div>
        </div>
        {state.currentMode === 'pomodoro' && !state.isRunning && (
          <Intention value={intention} onChange={setIntention} />
        )}
  <div className="flex justify-center items-center space-x-4">
          <button onClick={state.isRunning ? pause : start} className="control-btn control-btn-primary w-32">
            {state.isRunning ? t('pause') : state.timeRemaining < state.durations[state.currentMode] * 60 ? t('resume') : t('start')}
          </button>
          <button onClick={reset} className="control-btn w-12 h-12 flex items-center justify-center" title={t('reset')}>↺</button>
        </div>
        <div className="flex justify-center space-x-3 mt-8">
          {[0,1,2,3].map(i => (
            <div key={i} className="cycle-dot w-3 h-3 rounded-full transition-colors duration-500" style={{ backgroundColor: i < state.pomodoroCount ? 'var(--counter-fill)' : 'var(--counter-empty)' }} />
          ))}
        </div>
      </div>
  <footer className="absolute bottom-4 text-sm transition-opacity duration-500">{t('footer')}</footer>
      {showSettings && (
        <SettingsModal durations={state.durations} onClose={(d) => { if (d) updateDurations(d); setShowSettings(false); }} />
      )}
      {pendingRating && user && (
        <RatingModal data={pendingRating} onClose={async (rating, interrupted) => {
          if (rating || interrupted !== undefined) {
            await logSession({ user, ...pendingRating, rating: rating || null });
            if (user) refreshStats();
          }
          setPendingRating(null);
        }} />
      )}
    </main>
  );
}


// removed old modal/dashboard code (now dedicated page)

function RatingModal({ data, onClose }) {
  const [value, setValue] = useState(3);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="glass-container w-full max-w-sm rounded-2xl p-6 relative">
        <button onClick={()=>onClose()} className="absolute top-2 right-2 text-xs opacity-60 hover:opacity-100">✕</button>
        <h3 className="text-lg font-semibold mb-4">Focus rating</h3>
        <div className="flex justify-between mb-6 w-full">
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={()=>setValue(n)} className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${value===n? 'bg-gradient-to-br from-pink-500 to-indigo-500 text-white shadow':'bg-white/10 hover:bg-white/20'}`}>{n}</button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={()=>onClose(value,false)} className="control-btn flex-1">Save</button>
          <button onClick={()=>onClose(null,true)} className="control-btn flex-1 bg-white/10 hover:bg-white/20">Skip</button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ durations, onClose }) {
  const [form, setForm] = useState(durations);
  const update = (k, v) => setForm(s => ({ ...s, [k]: Number(v) || s[k] }));
  return (
    <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-container w-full max-w-sm rounded-2xl p-6">
        <h3 className="text-xl font-bold mb-6 text-center">{t('durationsTitle')}</h3>
        <div className="space-y-4">
          {[['pomodoro',t('durationPomodoro')],['shortBreak',t('durationShortBreak')],['longBreak',t('durationLongBreak')]].map(([k,label]) => (
            <div key={k} className="flex justify-between items-center">
              <label>{label}</label>
              <input className="setting-input bg-transparent border rounded-lg w-20 text-center py-1 focus:outline-none focus:ring-2 focus:ring-white/50" type="number" value={form[k]} onChange={e=>update(k,e.target.value)} />
            </div>
          ))}
        </div>
        <button onClick={()=>onClose(form)} className="w-full mt-8 control-btn">{t('close')}</button>
      </div>
    </div>
  );
}
