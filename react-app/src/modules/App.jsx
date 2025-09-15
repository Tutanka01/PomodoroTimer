import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TimerDisplay } from './TimerDisplay.jsx';
import { ModeSelector } from './ModeSelector.jsx';
import { Intention } from './Intention.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import SoundControl from './SoundControl.jsx';
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

  const onLongPress = useCallback(() => setShowSettings(true), []); // kept for backwards gesture, but we have a visible gear now

  return (
    <main className={`min-h-screen w-full flex flex-col items-center justify-center p-4 transition-all duration-1000 ${state.uiState}`}>      
      <div className="top-controls absolute top-6 right-6 z-30 flex items-center space-x-4 transition-all duration-500">
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
      <button aria-label="Timer settings" title="Timer settings" onClick={()=>setShowSettings(v=>!v)} className="settings-gear fixed top-6 left-6 z-30">
        <svg viewBox="0 0 24 24" className="gear-svg" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3.4" />
          <path d="M19.4 12.9c.04-.3.06-.6.06-.9s-.02-.6-.06-.9l2.07-1.62a.5.5 0 0 0 .12-.64l-1.96-3.4a.5.5 0 0 0-.6-.22l-2.44.98a7.2 7.2 0 0 0-1.56-.9l-.37-2.6A.5.5 0 0 0 14.2 2h-4.4a.5.5 0 0 0-.5.43l-.37 2.6c-.57.23-1.1.53-1.56.9l-2.44-.98a.5.5 0 0 0-.6.22L2.97 8.04a.5.5 0 0 0 .12.64L5.16 10.3c-.04.3-.06.6-.06.9s.02.6.06.9l-2.07 1.62a.5.5 0 0 0-.12.64l1.96 3.4c.14.24.43.34.6.22l2.44-.98c.46.37.99.67 1.56.9l.37 2.6c.04.25.25.43.5.43h4.4c.25 0 .46-.18.5-.43l.37-2.6c.57-.23 1.1-.53 1.56-.9l2.44.98c.24.1.5.02.6-.22l1.96-3.4a.5.5 0 0 0-.12-.64L19.4 12.9Z" />
        </svg>
      </button>
      <div className="glass-container w-full max-w-lg mx-auto rounded-3xl shadow-2xl p-6 sm:p-10 text-center relative">
        {showSettings && (
          <>
            <SoundControl />
            <InlineSettings durations={state.durations} onChange={(d)=>{ updateDurations(d); }} />
          </>
        )}
        <ModeSelector currentMode={state.currentMode} switchMode={switchMode} />
        <div className="relative mb-6">
          <TimerDisplay timeRemaining={state.timeRemaining} onLongPress={onLongPress} modeClass={state.isRunning ? (state.currentMode==='pomodoro' ? 'timer-work' : 'timer-break') : 'timer-idle'} />
          <div className="h-1 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mt-4">
            <div className="h-full focus-progress transition-all duration-700" style={{ width: `${Math.round(state.progress*100)}%` }} />
          </div>
        </div>
        {state.currentMode === 'pomodoro' && !state.isRunning && (
          <Intention value={intention} onChange={setIntention} />
        )}
  <div className="flex justify-center items-center space-x-4">
          <button onClick={() => { state.isRunning ? pause() : start(); }} className="control-btn control-btn-primary w-32">
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
  {/* Settings now inline; no modal overlay */}
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

function InlineSettings({ durations, onChange }) {
  const [form, setForm] = useState(durations);
  const [dirty, setDirty] = useState(false);
  useEffect(()=>{ setForm(durations); setDirty(false); }, [durations]);
  const rows = [ ['pomodoro', t('durationPomodoro')], ['shortBreak', t('durationShortBreak')], ['longBreak', t('durationLongBreak')] ];
  const update = (k, v) => setForm(s => { const val = Math.max(1, Number(v)||s[k]); setDirty(true); return { ...s, [k]: val }; });
  const quickPresets = [ { label:'25/5/15', p:25, s:5, l:15 }, { label:'45/8/20', p:45, s:8, l:20 }, { label:'52/17/25', p:52, s:17, l:25 } ];
  const applyPreset = (p) => { setForm({ pomodoro:p.p, shortBreak:p.s, longBreak:p.l }); setDirty(true); };
  return (
    <div className="inline-settings mb-4 -mt-2 text-left">
      <div className="inline-settings-inner p-4 rounded-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs uppercase tracking-wide opacity-70">{t('durationsTitle')}</h4>
          {dirty && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/80 text-white">Unsaved</span>}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {rows.map(([k,label]) => (
            <div key={k} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase opacity-60">{label}</span>
              <div className="flex items-center gap-1">
                <button onClick={()=>update(k, form[k]-1)} className="adj-btn !w-8 !h-8">−</button>
                <input className="duration-field !w-14 py-1" type="number" value={form[k]} onChange={e=>update(k,e.target.value)} />
                <button onClick={()=>update(k, form[k]+1)} className="adj-btn !w-8 !h-8">＋</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {quickPresets.map(p => (
            <button key={p.label} onClick={()=>applyPreset(p)} className="text-[10px] px-2 py-1 rounded-md bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/20 transition-colors">{p.label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button disabled={!dirty} onClick={()=>{ onChange(form); setDirty(false); }} className="control-btn flex-1 disabled:opacity-40 disabled:cursor-not-allowed">Save</button>
          <button disabled={!dirty} onClick={()=>{ setForm(durations); setDirty(false); }} className="control-btn flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-30">Reset</button>
        </div>
      </div>
    </div>
  );
}
